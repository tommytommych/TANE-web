import { NextResponse } from 'next/server';
import { messagingApi, validateSignature } from '@line/bot-sdk';
import { GoogleGenAI, createPartFromBase64, createPartFromText } from '@google/genai';
import { buildSystemInstruction, CAMEO_MODE_TRIGGER_REGEX } from '../../lib/systemPrompt';
import { stripInternalBlocks, extractContextFromContent } from '../../lib/cutlist';
import { getConversationState, saveConversationState } from '../../lib/lineConversationHistory';

export const runtime = 'nodejs';

// app/api/chat・app/api/space-diyと同様、会話履歴の蓄積・画像処理でGeminiの応答生成に
// 時間がかかる場合があるため、maxDuration未設定時のVercelデフォルトタイムアウトによる
// 打ち切りを避ける（LINEの返信トークン自体の有効期限内で完了する前提は変わらない）
export const maxDuration = 60;

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

// ユーザーが写真を送ってきたときにGeminiへ添える固定の指示文
const IMAGE_PROMPT =
  '設置したい場所や作りたいもの・参考にしたいものの写真が送られてきました。写真の内容（部屋の雰囲気、壁や床の色・素材、既存の家具、空いているスペースなど）を具体的に読み取り、木工DIY初心者にも分かりやすく、この写真に合わせた具体的なアドバイス（おすすめのサイズ感、雰囲気に合う木材、作り方のヒントなど）をしてください。';

// LINEのメッセージ1通あたりの上限文字数。超えるとreplyMessageが失敗するため安全に切り詰める
const LINE_TEXT_MESSAGE_LIMIT = 5000;

// リッチメニュー等からこのテキストが送られてきた場合は、Geminiによる自動応答を行わず
// LINE公式アカウントマネージャーでの手動チャット対応に委ねる
const HUMAN_HANDOFF_MESSAGE = 'ご意見・リクエストを送ります';

// ご意見・ご質問フォームのURL（docs/survey-schema.md参照）
const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSe_AS7xrjQuaa90Ao_E9bwbMwJFvqrNbM2UtKzQvq9sCNg14w/viewform';

// ハンドオフ時に、何も返信されず不安にならないようフォームへの案内を返す定型メッセージ（docs/survey-schema.md参照）
const HUMAN_HANDOFF_REPLY_MESSAGE =
  `いつもTANE:iをご利用いただきありがとうございます🌱\n\n` +
  `ご意見・ご質問はこちらの専用フォームから送っていただけると、チームで一つひとつ確認しやすくなります😊\n\n` +
  `▼ご意見・ご質問フォーム\n${FEEDBACK_FORM_URL}\n\n` +
  `もちろん、このままメッセージを送っていただいても大丈夫です！`;

// Gemini呼び出しにタイムアウトが無いと、まれに応答が返らないまま無期限に待ち続け、
// Vercelの関数タイムアウト（maxDuration）まで無反応になってしまう（実機で確認済みの不具合）。
// LINEの返信トークンは短時間で失効するため、まだ余裕をもってエラー返信できる時間で区切る。
// 1回だけ自動リトライする分の時間も見込んで、単発時の25秒より短めに設定する
const GEMINI_TIMEOUT_MS = 15000;
const GEMINI_RETRY_DELAY_MS = 1000;

// Gemini側の一時的な過負荷（503 UNAVAILABLE）・処理遅延（504 DEADLINE_EXCEEDED）は、
// 少し時間を置いて同じリクエストをもう一度送るだけで成功することが多い。実機検証で
// 実際にこれらのエラーが発生する場面を確認したため、ユーザーにエラーを見せる前に
// 1回だけ自動でやり直す（RESOURCE_EXHAUSTED等のクォータ超過はリトライしても
// 無駄なため対象外）
function isTransientGeminiError(error) {
  const status = error && typeof error.status === 'number' ? error.status : null;
  if (status === 503 || status === 504) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNAVAILABLE') || message.includes('DEADLINE_EXCEEDED');
}

async function generateContentWithRetry(config) {
  try {
    return await ai.models.generateContent(config);
  } catch (error) {
    if (!isTransientGeminiError(error)) throw error;
    console.warn('LINE bot Gemini transient error, retrying once:', error);
    await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
    return await ai.models.generateContent(config);
  }
}

// TANE:i本体(app/app/page.tsx)の「本日の無料相談 10回」と同じ回数・仕様に合わせる。
// LINE bot側はサーバーで完結する必要があるため、ユーザーごと・日付ごとにサーバー側で実カウントする
// （本体側はブラウザのstateだけで実際には強制されていないカウンターだが、こちらは実際に上限まで制限する）
const DAILY_MESSAGE_LIMIT = 10;
const LIMIT_REACHED_MESSAGE =
  '本日の無料相談回数の上限（10回）に達しました🙏 また明日、あらためてご相談ください。';

// メモリ上の簡易カウンター。Vercelなどサーバーレス環境では、インスタンスの入れ替わりにより
// カウントが完全には引き継がれない場合がある点に注意（永続化が必要な場合はKV/DB導入を検討）
const usageByUser = new Map();

function getJstDateKey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

// userIdごとに当日の利用回数をチェックし、上限内であればカウントを1つ消費してtrueを返す
function consumeDailyQuota(userId) {
  const today = getJstDateKey();
  const usage = usageByUser.get(userId);

  if (!usage || usage.date !== today) {
    usageByUser.set(userId, { date: today, count: 1 });
    return true;
  }

  if (usage.count >= DAILY_MESSAGE_LIMIT) {
    return false;
  }

  usage.count += 1;
  return true;
}

// このAPIキーのアカウントでは "gemini-2.5-flash" が
// "no longer available to new users" (404) となり使用できないため、
// 同じ世代のFlashモデルを指す常時最新のエイリアスを使用する（app/api/chatと同じ方針）
//
// LINEはメッセージごとに独立したWebhookイベントとして届き、WEB版のようにブラウザ側で
// 会話履歴を持てないため、userIdをキーにサーバー側（app/lib/lineConversationHistory）で
// 直近の会話履歴と判明済みContextを保持し、毎回Geminiへ引き継ぐ。これにより、設置場所や
// 家具の種類などを何度も聞き直してしまうループを防ぐ（app/api/chatのcontextNoteと同じ方針）
async function generateReply(userId, currentUserText, parts, { isCameoMode = false } = {}) {
  const state = await getConversationState(userId);

  const contents = [
    ...state.turns.map((turn) => ({ role: turn.role, parts: [createPartFromText(turn.text)] })),
    { role: 'user', parts },
  ];

  const contextNote = state.context
    ? `\n\n【これまでに判明している情報（Context）】\n${JSON.stringify(state.context)}\n上記のうち値がnullの項目を優先して、次の質問を1つだけしてください。item・size・place・budget・experienceが埋まっていれば設計を開始してください。`
    : '';

  const response = await generateContentWithRetry({
    model: 'gemini-flash-latest',
    contents,
    config: {
      systemInstruction: buildSystemInstruction({ isCameoMode }) + contextNote,
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
    },
  });

  const rawText = response.text || 'うまく回答を生成できませんでした。もう一度お試しください。';
  // tanei-context等の内部データブロックはWEB版UIの解析専用で、LINEのプレーンテキスト返信には不要かつ
  // そのまま見せると不自然なため取り除く
  const strippedText = stripInternalBlocks(rawText);

  // 次回の呼び出しに引き継ぐため、今回のやり取りを履歴へ追加して保存する。
  // 履歴にはstripped後のテキストのみを保持し（tanei-*ブロックはGeminiへの再入力にも不要）、
  // Contextだけはtanei-contextブロックから抽出した最新の値で更新する
  const newContext = extractContextFromContent(rawText) ?? state.context;
  await saveConversationState(userId, {
    turns: [...state.turns, { role: 'user', text: currentUserText }, { role: 'model', text: strippedText }],
    context: newContext,
  });

  return strippedText.slice(0, LINE_TEXT_MESSAGE_LIMIT);
}

function generateReplyText(userId, userMessage) {
  return generateReply(userId, userMessage, [createPartFromText(userMessage)], {
    isCameoMode: CAMEO_MODE_TRIGGER_REGEX.test(userMessage),
  });
}

function generateReplyForImage(userId, base64Image, mimeType) {
  // 画像バイナリ自体は容量が大きく、履歴に保存する意味も薄いため、履歴上のユーザー発言としては
  // プレースホルダーのテキストのみを残す（写真から読み取った内容はAIの返答テキスト側に残る）
  return generateReply(userId, '（写真を送信しました）', [
    createPartFromText(IMAGE_PROMPT),
    createPartFromBase64(base64Image, mimeType),
  ]);
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
    // 外部URLへのfetchにもタイムアウトが無いと同様に無期限に待ち続ける可能性があるため、
    // Gemini呼び出しと同じ考え方でAbortControllerによる上限を設ける
    const res = await fetch(message.contentProvider.originalContentUrl, {
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType };
  }

  const { httpResponse, body } = await lineBlobClient.getMessageContentWithHttpInfo(message.id);
  const mimeType = httpResponse.headers.get('content-type') || 'image/jpeg';
  const buffer = await streamToBuffer(body);
  return { base64: buffer.toString('base64'), mimeType };
}

// Gemini呼び出し失敗時に、初心者にも分かる言葉で「時間をおいて」と案内する
// （レート上限か、それ以外の通信エラーかで文言を分ける。app/api/chatと同じ方針・同じ文言）
function buildGeminiErrorReplyText(error) {
  const message = error instanceof Error ? error.message : String(error);
  const isQuotaError =
    message.includes('RESOURCE_EXHAUSTED') || message.includes('429') || message.toLowerCase().includes('quota');

  return isQuotaError
    ? '本日のAI利用回数の上限に達したようです🙏 しばらく時間をおいてから、もう一度お試しください。'
    : '通信エラーが発生しました。少し時間をおいてから、もう一度お試しください。';
}

// LINEへの返信自体が失敗しても（replyTokenの期限切れ・認証エラーなど）、
// 全体の処理は止めずログだけ残す
async function replySafely(replyToken, text) {
  try {
    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  } catch (error) {
    console.error('LINE bot reply error:', error);
  }
}

async function handleMessageEvent(event) {
  if (event.type !== 'message') {
    return;
  }

  if (event.message.type !== 'text' && event.message.type !== 'image') {
    return;
  }

  // Geminiは呼ばず、受付を伝える定型メッセージだけ返信してLINE側の手動チャットに委ねる
  if (event.message.type === 'text' && event.message.text === HUMAN_HANDOFF_MESSAGE) {
    await replySafely(event.replyToken, HUMAN_HANDOFF_REPLY_MESSAGE);
    return;
  }

  const userId = event.source?.userId;

  if (userId && !consumeDailyQuota(userId)) {
    await replySafely(event.replyToken, LIMIT_REACHED_MESSAGE);
    return;
  }

  let replyText;

  try {
    if (event.message.type === 'text') {
      replyText = await generateReplyText(userId, event.message.text);
    } else {
      const { base64, mimeType } = await fetchLineImageAsBase64(event.message);
      replyText = await generateReplyForImage(userId, base64, mimeType);
    }
  } catch (error) {
    console.error('LINE bot Gemini error:', error);
    replyText = buildGeminiErrorReplyText(error);
  }

  await replySafely(event.replyToken, replyText);
}

export async function POST(req) {
  if (!CHANNEL_SECRET || !CHANNEL_ACCESS_TOKEN) {
    console.error('LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN is not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // TEMP DEBUG（原因調査用、確認後に削除する）：実際にVercel上で使われているGEMINI_API_KEYの
  // フィンガープリント（先頭6文字＋末尾4文字のみ）をログに出す。キー自体は出力しない
  const geminiKey = process.env.GEMINI_API_KEY || '';
  console.log(
    'TEMP DEBUG gemini key fingerprint:',
    geminiKey ? `${geminiKey.slice(0, 6)}...${geminiKey.slice(-4)} (length=${geminiKey.length})` : '(empty)'
  );

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
