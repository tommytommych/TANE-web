// サーバー（Vercel KV）が未接続の環境でも「本日の残り回数」がブラウザの
// リロードで消えてしまわないよう、日付キー付きでlocalStorageに残数を保持する
// クライアント側の永続化ヘルパー。KVが接続されている環境では、サーバーから
// 返る実際の残数との差分はより厳しい（小さい）方が優先される想定で使う

// カット申込書PDF・完成イメージ（設計スタジオ）・写真AI空間診断・外部Gemini画像生成が
// 共通で消費する「本日のAI機能利用」の上限・保存キー。app/app/page.tsxと
// app/components/studio/StudioEmbed.tsxの両方から参照するため、ここで一元管理する
export const DAILY_IMAGE_LIMIT = 5;
export const IMAGE_USAGE_STORAGE_KEY = 'tanei-image-usage-v1';

interface StoredUsage {
  dateKey: string;
  remaining: number;
}

function getJstDateKey(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function readStoredUsage(storageKey: string, dailyLimit: number): StoredUsage {
  const todayKey = getJstDateKey();
  if (typeof window === 'undefined') return { dateKey: todayKey, remaining: dailyLimit };

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredUsage>;
      if (parsed.dateKey === todayKey && typeof parsed.remaining === 'number') {
        return { dateKey: todayKey, remaining: Math.max(0, Math.min(dailyLimit, parsed.remaining)) };
      }
    }
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない場合は、上限まで残っているものとして扱う
  }
  return { dateKey: todayKey, remaining: dailyLimit };
}

function writeStoredUsage(storageKey: string, usage: StoredUsage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(usage));
  } catch {
    // 書き込めない環境でも致命的な失敗にはしない
  }
}

export function getLocalRemainingCount(storageKey: string, dailyLimit: number): number {
  return readStoredUsage(storageKey, dailyLimit).remaining;
}

// 残り回数を1つ消費して保存し、消費後の残り回数を返す
export function consumeLocalUsage(storageKey: string, dailyLimit: number): number {
  const current = readStoredUsage(storageKey, dailyLimit);
  const next = Math.max(0, current.remaining - 1);
  writeStoredUsage(storageKey, { dateKey: current.dateKey, remaining: next });
  return next;
}

// サーバーから取得したより正確な残数など、外部の値で上書き保存する
export function setLocalRemainingCount(storageKey: string, dailyLimit: number, value: number): void {
  writeStoredUsage(storageKey, { dateKey: getJstDateKey(), remaining: Math.max(0, Math.min(dailyLimit, value)) });
}
