import { NextResponse } from 'next/server';
import { messagingApi, validateSignature } from '@line/bot-sdk';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

const { MessagingApiClient } = messagingApi;

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

const lineClient = new MessagingApiClient({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION =
  'あなたはAIを活用した木工DIY設計サポートサービス『TANEi（たねあい）』のAIアシスタントです。初心者向けに、親切、丁寧、具体的に木工DIYの相談に乗ってください。';

// LINEのメッセージ1通あたりの上限文字数。超えるとreplyMessageが失敗するため安全に切り詰める
const LINE_TEXT_MESSAGE_LIMIT = 5000;

// このAPIキーのアカウントでは "gemini-2.5-flash" が
// "no longer available to new users" (404) となり使用できないため、
// 同じ世代のFlashモデルを指す常時最新のエイリアスを使用する（app/api/chatと同じ方針）
async function generateReplyText(userMessage) {
  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });

  const text = response.text || 'うまく回答を生成できませんでした。もう一度お試しください。';
  return text.slice(0, LINE_TEXT_MESSAGE_LIMIT);
}

async function handleMessageEvent(event) {
  if (event.type !== 'message' || event.message?.type !== 'text') {
    return;
  }

  try {
    const replyText = await generateReplyText(event.message.text);

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
