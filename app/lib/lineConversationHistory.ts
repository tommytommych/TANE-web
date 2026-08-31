import { kv } from '@vercel/kv';
import type { DesignContext, MaterialGroup } from './cutlist';
import type { SheetLayout } from './sheetLayout';

// LINE Bot(app/api/line/route.js)専用の会話ステート管理。
// LINEのMessaging APIは1メッセージごとに独立したWebhookイベントとして届くため、WEB版のように
// ブラウザのReact stateで会話履歴を持ち続けることができない。ユーザーIDをキーに、直近の会話履歴と
// 判明済みContextをサーバー側（Vercel KV）で保持し、次のGemini呼び出しに引き継ぐことで、
// 「設置場所や家具の種類を何度も聞き直す」ループを防ぐ。

export interface StoredTurn {
  role: 'user' | 'model';
  text: string;
}

export interface ConversationState {
  turns: StoredTurn[];
  context: DesignContext | null;
  // 直近でAIが提案した木取りデータ（tanei-cutlist・tanei-sheetlayout）。
  // 「木取り図」リッチメニューから「ホームセンターのカット申込書」形式の
  // テキストを求められた時に使う。strippedText（会話履歴用）からは
  // tanei-*ブロックが取り除かれるため、別途ここに保持しておく必要がある
  lastMaterialGroups: MaterialGroup[] | null;
  lastSheetLayouts: SheetLayout[] | null;
  // 「ホームセンターのカット申込書として出しますか？」の確認待ち状態。
  // trueの間だけ、次のメッセージを「はい/いいえ」の返答として解釈する
  pendingCutSheetConfirmation: boolean;
}

const EMPTY_STATE: ConversationState = {
  turns: [],
  context: null,
  lastMaterialGroups: null,
  lastSheetLayouts: null,
  pendingCutSheetConfirmation: false,
};

// やり取りが無いまま経過したら会話をリセットする猶予期間
const HISTORY_TTL_SECONDS = 60 * 60 * 24;

// 直近何ターン（ユーザー・AI発言を1ターンとして）まで保持するか。
// 増やしすぎるとGemini呼び出しのトークン量・KV保存量が膨らむため上限を設ける
const MAX_TURNS = 20;

// Vercel KVが未接続の環境（ローカル開発や、KV接続前の本番）でもチャット機能自体は壊れないよう、
// 未設定時はプロセスメモリ上のMapにフォールバックする。ただしサーバーレス環境ではインスタンスの
// 入れ替わりで履歴が失われ得るため、本番では必ずKVを接続すること
const KV_CONFIGURED = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const inMemoryState = new Map<string, ConversationState>();

function stateKey(userId: string): string {
  return `tanei:line-history:${userId}`;
}

export async function getConversationState(userId: string | undefined): Promise<ConversationState> {
  if (!userId) return EMPTY_STATE;
  // ...EMPTY_STATEで補完することで、スキーマ追加前（lastMaterialGroups等が無い）に
  // 保存された古いstateを読み込んでも欠けたフィールドがundefinedのまま扱われず、
  // 常に全フィールドが揃った状態になる
  if (!KV_CONFIGURED) return { ...EMPTY_STATE, ...(inMemoryState.get(userId) ?? {}) };

  const state = await kv.get<ConversationState>(stateKey(userId));
  return { ...EMPTY_STATE, ...(state ?? {}) };
}

export async function saveConversationState(userId: string | undefined, state: ConversationState): Promise<void> {
  if (!userId) return;

  const trimmed: ConversationState = { ...state, turns: state.turns.slice(-MAX_TURNS) };

  if (!KV_CONFIGURED) {
    inMemoryState.set(userId, trimmed);
    return;
  }
  await kv.set(stateKey(userId), trimmed, { ex: HISTORY_TTL_SECONDS });
}

// ユーザーが「最初からやり直す」等でリセットを求めた際に、会話履歴・判明済みContextを
// 完全に消す。saveConversationState(userId, EMPTY_STATE)と等価だが、リセット専用の
// 意図が呼び出し側から分かりやすいよう別名で用意する
export async function resetConversationState(userId: string | undefined): Promise<void> {
  if (!userId) return;

  if (!KV_CONFIGURED) {
    inMemoryState.delete(userId);
    return;
  }
  await kv.del(stateKey(userId));
}
