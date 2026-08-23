// TANE:i LINE公式アカウント（友だち追加・相談導線）のURL。
// TopBar / LeftSidebar / lp/Footer から共通で参照する（同一URLが複数箇所に散らばらないようにする）
export const LINE_OFFICIAL_URL = 'https://line.me/R/ti/p/@mdo9046l';

// LINE連携（公式アカウント誘導）はまだ開発中のため、本番ビルドでは導線を「準備中」として無効化する。
// Vercel上はProduction・Previewいずれもnext buildでNODE_ENVが'production'になるため、
// `npm run dev`のローカル開発時のみ有効になる。app/lib/rateLimit.ts・app/lib/localUsage.tsの
// IS_DEV_ENVIRONMENTと同じ判定方式に揃えている
export const LINE_ENABLED = process.env.NODE_ENV !== 'production';
