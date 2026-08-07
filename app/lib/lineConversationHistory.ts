import { kv } from '@vercel/kv';
import type { DesignContext } from './cutlist';

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
}

const EMPTY_STATE: ConversationState = { turns: [], context: null };

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
  if (!KV_CONFIGURED) return inMemoryState.get(userId) ?? EMPTY_STATE;

  const state = await kv.get<ConversationState>(stateKey(userId));
  return state ?? EMPTY_STATE;
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
