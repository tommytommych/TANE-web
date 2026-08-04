import { kv } from '@vercel/kv';

// TANE:iの「本日の無料相談」上限。LINE bot(app/api/line/route.js)と同じ回数・仕様
export const DAILY_MESSAGE_LIMIT = 10;

// 日付をまたいでも念のため少し長めに保持し、古いキーは自動失効させる
const USAGE_TTL_SECONDS = 60 * 60 * 48;

// Vercel KVが未接続の環境（ローカル開発や、KV接続前の本番）でもチャット機能自体は
// 壊れないよう、未設定時は制限をかけず常に上限まで残っているものとして扱う
const KV_CONFIGURED = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

function getJstDateKey(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function usageKey(userId: string): string {
  return `tanei:usage:${userId}:${getJstDateKey()}`;
}

export async function getRemainingCount(userId: string): Promise<number> {
  if (!KV_CONFIGURED) return DAILY_MESSAGE_LIMIT;

  const count = (await kv.get<number>(usageKey(userId))) ?? 0;
  return Math.max(0, DAILY_MESSAGE_LIMIT - count);
}

// 使用回数を1つ消費し、消費後の残り回数を返す。すでに上限に達していた場合は
// 消費せずnullを返す
export async function consumeUsage(userId: string): Promise<number | null> {
  if (!KV_CONFIGURED) return DAILY_MESSAGE_LIMIT;

  const key = usageKey(userId);
  const count = (await kv.get<number>(key)) ?? 0;

  if (count >= DAILY_MESSAGE_LIMIT) {
    return null;
  }

  const newCount = await kv.incr(key);
  if (newCount === 1) {
    await kv.expire(key, USAGE_TTL_SECONDS);
  }

  return Math.max(0, DAILY_MESSAGE_LIMIT - newCount);
}
