// 設計スタジオ（tanei-studio/、PC専用機能）とのWebSocket同期・レンダリングリクエストに使う、
// ブラウザのタブ単位で一意なセッションID。
//
// 例えば同じ端末でチャットのタブを2つ開いて別々の相談をした場合など、複数タブ・複数の
// 相談が同時に走ると設計内容が混ざってしまうため、サーバー側（tanei-studio/server.py）は
// このIDごとに接続クライアント・直近の確定仕様を分離して管理する。分離が機能するには、
// チャット側（このモジュール、sessionStorageで保持）と設計スタジオ側（iframeのURLに
// ?sessionId=...として渡し、static/index.htmlがそこから読み取って自分のWebSocket接続・
// レンダリングリクエストに使う）が「同じタブでは常に同じID」を共有する必要がある。
// sessionStorageを使うのは、タブを閉じれば自然に消え、かつ同一タブ内でのページ遷移
// （/app ⇔ /app/studio）では保持され続けるため（localStorageだと他のタブ・他のユーザーとは
// 区別されないブラウザ全体の値になってしまい、意味がない）。

const STUDIO_SESSION_ID_STORAGE_KEY = 'tanei-studio-session-id-v1';

// sessionStorageが使えない環境（プライベートブラウジング等）でも、少なくとも同じ
// ページ読み込みの間だけは同じIDを返せるよう、モジュールスコープにも保持しておく
let inMemoryFallbackId: string | null = null;

export function getOrCreateStudioSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.sessionStorage.getItem(STUDIO_SESSION_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(STUDIO_SESSION_ID_STORAGE_KEY, created);
    return created;
  } catch {
    if (!inMemoryFallbackId) inMemoryFallbackId = crypto.randomUUID();
    return inMemoryFallbackId;
  }
}
