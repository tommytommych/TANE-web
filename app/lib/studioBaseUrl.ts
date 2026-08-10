// TANE:i設計スタジオ（tanei-studio/、FreeCAD+POV-Ray）の接続先ベースURLを解決するヘルパー。
//
// 優先順位:
// 1. ブラウザのlocalStorageに保存された上書き値（⚙️の接続設定パネルで手動設定した場合。
//    クラウド化した後もローカル開発時に別ホストを指したい場合の逃げ道として残している）
// 2. ビルド時の環境変数 NEXT_PUBLIC_STUDIO_BASE_URL（Vercelに設定した、Renderなど
//    クラウド上に常時稼働でデプロイした設計スタジオのURL。例: https://tanei-studio.onrender.com。
//    DEPLOY.md参照）
// 3. ローカル開発用の既定値 http://localhost:5002（NEXT_PUBLIC_STUDIO_BASE_URL未設定時の
//    フォールバック。オペレーターが手元でtanei-studio/を起動して使う場合はこちらになる）

const STUDIO_BASE_URL_STORAGE_KEY = 'tanei-studio-base-url-v2';
export const LOCAL_DEV_STUDIO_BASE_URL = 'http://localhost:5002';

// NEXT_PUBLIC_*はNext.jsのビルド時にクライアントバンドルへ直接インライン化される
// （実行時にサーバーから読むのではない）ため、Vercel側で設定したら再デプロイが必要
const CONFIGURED_STUDIO_BASE_URL = process.env.NEXT_PUBLIC_STUDIO_BASE_URL?.trim() || null;

export const DEFAULT_STUDIO_BASE_URL = CONFIGURED_STUDIO_BASE_URL || LOCAL_DEV_STUDIO_BASE_URL;

// クラウド上に常時稼働の設計スタジオが設定されているかどうか。trueなら「パソコン専用」の
// 注意書きや、狭い画面幅での接続設定パネル自動表示は不要になる（誰でもそのまま使えるため）
export const STUDIO_IS_CLOUD_HOSTED = CONFIGURED_STUDIO_BASE_URL !== null;

const changeListeners = new Set<(url: string) => void>();

// プロトコル省略時はhttps://を補い、末尾のスラッシュを取り除く
export function normalizeStudioBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^[a-zA-Z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
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
