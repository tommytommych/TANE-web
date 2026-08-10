// TANE:i設計スタジオ（tanei-studio/、FreeCAD+POV-Ray）の接続先ベースURLを解決するヘルパー。
//
// 設計スタジオはPC専用機能: オペレーターの手元PCで`python3 server.py`（既定ポート5002）を
// 起動して使う。既定では常に http://localhost:5002 を使い、同じWi-Fi上のスマートフォン等
// 別端末から使いたい場合のみ、⚙️の接続設定パネルでPCのIPアドレス（例: 192.168.1.23:5002）に
// 手動で切り替えられるようにしている（localStorageに保存、その端末だけで有効）。

const STUDIO_BASE_URL_STORAGE_KEY = 'tanei-studio-base-url-v3';
export const DEFAULT_STUDIO_BASE_URL = 'http://localhost:5002';

const changeListeners = new Set<(url: string) => void>();

// プロトコル省略時はhttp://を補い（ローカル・LAN上のFlaskサーバーはTLSを持たないため）、
// 末尾のスラッシュを取り除く
export function normalizeStudioBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^[a-zA-Z]+:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function getStudioBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_STUDIO_BASE_URL;
  try {
    const stored = window.localStorage.getItem(STUDIO_BASE_URL_STORAGE_KEY);
    return stored && stored.trim() ? stored : DEFAULT_STUDIO_BASE_URL;
  } catch {
    return DEFAULT_STUDIO_BASE_URL;
  }
}

// 接続先を保存し、購読中のリスナー（studioSync.tsの再接続処理など）へ通知する
export function setStudioBaseUrl(input: string): string {
  const normalized = normalizeStudioBaseUrl(input) || DEFAULT_STUDIO_BASE_URL;
  try {
    window.localStorage.setItem(STUDIO_BASE_URL_STORAGE_KEY, normalized);
  } catch {
    // 保存できない環境（プライベートブラウジング等）でも致命的な失敗にはしない
  }
  changeListeners.forEach((listener) => listener(normalized));
  return normalized;
}

// 接続先が変わったことを購読する（戻り値の関数で購読解除）
export function onStudioBaseUrlChange(listener: (url: string) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function getStudioWsUrl(): string {
  // http:// -> ws://、https:// -> wss://（先頭の"http"だけを置き換えるので両方に対応する）
  return `${getStudioBaseUrl().replace(/^http/, 'ws')}/ws/sync`;
}
