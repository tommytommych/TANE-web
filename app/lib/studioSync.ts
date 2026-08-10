// TANE:iチャットと「TANE:i設計スタジオ」(FreeCAD+POV-Rayによる木工設計スタジオ、tanei-studio/。
// freecad-studio/を複製してTANE:iに組み込んだ本番の実体)との双方向データ同期。
// 設計スタジオはfreecadcmd/povrayというローカルバイナリに依存するため、このNext.jsアプリの
// サーバー側（Vercel）から直接叩くことはできない。そのため同期はブラウザ側のJavaScriptが、
// 設計スタジオ（既定はRender等クラウド上に常時稼働のURL。app/lib/studioBaseUrl.ts参照。
// 未設定時はローカル開発用にhttp://localhost:5002にフォールバックする）のWebSocket
// エンドポイントへ直結する形で行う（設計スタジオに接続できない環境では、単に接続が
// 確立されないだけでエラーにはならない）。
import type { StudioSpec } from './studioSpec';
import { getStudioWsUrl, onStudioBaseUrlChange } from './studioBaseUrl';
import { getOrCreateStudioSessionId } from './studioSession';

let socket: WebSocket | null = null;
const updateListeners = new Set<(spec: StudioSpec) => void>();

// タブごとに一意なsessionIdをクエリで渡すことで、サーバー（tanei-studio/server.py）が
// このタブ専用の同期状態として分離して扱えるようにする（他の利用者の設計内容と混ざらない）
function buildSyncWsUrl(): string {
  const url = new URL(getStudioWsUrl());
  url.searchParams.set('sessionId', getOrCreateStudioSessionId());
  return url.toString();
}

function ensureSocket(): WebSocket | null {
  if (typeof window === 'undefined') return null;
  if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
    return socket;
  }
  try {
    const ws = new WebSocket(buildSyncWsUrl());
    ws.addEventListener('close', () => {
      if (socket === ws) socket = null;
    });
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'spec-update' && msg?.source === 'studio' && msg?.payload) {
          updateListeners.forEach((listener) => listener(msg.payload as StudioSpec));
        }
      } catch {
        // 設計スタジオ側からの不正なメッセージは無視する
      }
    });
    socket = ws;
    return ws;
  } catch {
    return null;
  }
}

// 接続先ベースURL（studioBaseUrl.ts）が変更されたら、古い接続を閉じて次回利用時に
// 新しいホストへ繋ぎ直す。すでにリスナー登録済みなら、切り替わった直後に再接続しておく
if (typeof window !== 'undefined') {
  onStudioBaseUrlChange(() => {
    socket?.close();
    socket = null;
    if (updateListeners.size > 0) ensureSocket();
  });
}

// 設計スタジオ側で確定・保存された仕様の更新を受け取るリスナーを登録する。
// 戻り値の関数を呼ぶと登録解除できる（ReactのuseEffectのクリーンアップ用）
export function connectStudioSync(onStudioUpdate: (spec: StudioSpec) => void): () => void {
  updateListeners.add(onStudioUpdate);
  ensureSocket();
  return () => {
    updateListeners.delete(onStudioUpdate);
  };
}

// チャットで確定した仕様を設計スタジオへ送る。呼び出し側（CompletionCards.tsx）は
// この直後に/app/studioへ画面遷移する想定: 遷移先のiframeが新たに/ws/syncへ接続すると、
// サーバー（tanei-studio/server.py）が保持している最新仕様（このsendで更新される）を
// 接続直後に送り返してくるため、遷移のタイミングが多少前後しても確実に反映される。
// 設計スタジオが起動していない場合は接続自体が確立されないため、何もせず戻る
// （遷移先のページに「サーバーを起動してください」という案内を表示している）
export function pushSpecToStudio(spec: StudioSpec): void {
  const ws = ensureSocket();
  if (!ws) return;

  const send = () => ws.send(JSON.stringify({ type: 'spec-update', source: 'chat', payload: spec }));

  if (ws.readyState === WebSocket.OPEN) {
    send();
  } else if (ws.readyState === WebSocket.CONNECTING) {
    ws.addEventListener('open', send, { once: true });
  }
}
