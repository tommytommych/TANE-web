import { NextResponse } from 'next/server';
import { messagingApi, validateSignature } from '@line/bot-sdk';
import { GoogleGenAI, createPartFromBase64, createPartFromText } from '@google/genai';

export const runtime = 'nodejs';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

const lineClient = new MessagingApiClient({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
});

// 画像バイナリのダウンロードはMessaging API本体とは別ホスト(api-data.line.me)を叩く専用クライアント
const lineBlobClient = new MessagingApiBlobClient({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION =
  'あなたはAIを活用した木工DIY設計サポートサービス『TANEi（たねあい）』のAIアシスタントです。初心者向けに、親切、丁寧、具体的に木工DIYの相談に乗ってください。';

// ユーザーが写真を送ってきたときにGeminiへ添える固定の指示文
const IMAGE_PROMPT =
  '設置したい場所や作りたいもの・参考にしたいものの写真が送られてきました。写真の内容（部屋の雰囲気、壁や床の色・素材、既存の家具、空いているスペースなど）を具体的に読み取り、木工DIY初心者にも分かりやすく、この写真に合わせた具体的なアドバイス（おすすめのサイズ感、雰囲気に合う木材、作り方のヒントなど）をしてください。';

// LINEのメッセージ1通あたりの上限文字数。超えるとreplyMessageが失敗するため安全に切り詰める
const LINE_TEXT_MESSAGE_LIMIT = 5000;

// このAPIキーのアカウントでは "gemini-2.5-flash" が
// "no longer available to new users" (404) となり使用できないため、
// 同じ世代のFlashモデルを指す常時最新のエイリアスを使用する（app/api/chatと同じ方針）
async function generateReply(parts) {
  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });

  const text = response.text || 'うまく回答を生成できませんでした。もう一度お試しください。';
  return text.slice(0, LINE_TEXT_MESSAGE_LIMIT);
}

function generateReplyText(userMessage) {
  return generateReply([createPartFromText(userMessage)]);
}

function generateReplyForImage(base64Image, mimeType) {
  return generateReply([createPartFromText(IMAGE_PROMPT), createPartFromBase64(base64Image, mimeType)]);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// LINEの画像コンテンツを取得しBase64化する。contentProvider.type === 'external' の場合は
// LINEサーバーを経由せず、送信されたURLから直接取得する
async function fetchLineImageAsBase64(message) {
  if (message.contentProvider?.type === 'external' && message.contentProvider.originalContentUrl) {
    const res = await fetch(message.contentProvider.originalContentUrl);
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType };
  }

  const { httpResponse, body } = await lineBlobClient.getMessageContentWithHttpInfo(message.id);
  const mimeType = httpResponse.headers.get('content-type') || 'image/jpeg';
  const buffer = await streamToBuffer(body);
  return { base64: buffer.toString('base64'), mimeType };
}

async function handleMessageEvent(event) {
  if (event.type !== 'message') {
    return;
  }

  try {
    let replyText;

    if (event.message.type === 'text') {
      replyText = await generateReplyText(event.message.text);
    } else if (event.message.type === 'image') {
      const { base64, mimeType } = await fetchLineImageAsBase64(event.message);
      replyText = await generateReplyForImage(base64, mimeType);
    } else {
      return;
    }

    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: replyText }],
    });
  } catch (error) {
    console.error('LINE bot reply error:', error);
  }
}

export async function POST(req) {
  if (!CHANNEL_SECRET || !CHANNEL_ACCESS_TOKEN) {
    console.error('LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN is not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const signature = req.headers.get('x-line-signature');
  const body = await req.text();

  if (!signature || !validateSignature(body, CHANNEL_SECRET, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const data = JSON.parse(body);
  const events = Array.isArray(data.events) ? data.events : [];

  await Promise.all(events.map(handleMessageEvent));

  return NextResponse.json({ status: 'ok' });
}
