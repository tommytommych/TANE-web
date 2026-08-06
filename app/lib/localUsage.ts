// サーバー（Vercel KV）が未接続の環境でも「本日の残り回数」がブラウザの
// リロードで消えてしまわないよう、日付キー付きでlocalStorageに残数を保持する
// クライアント側の永続化ヘルパー。KVが接続されている環境では、サーバーから
// 返る実際の残数との差分はより厳しい（小さい）方が優先される想定で使う

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
