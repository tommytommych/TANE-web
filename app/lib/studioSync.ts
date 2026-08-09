// TANE:iチャットと「TANE:i設計スタジオ」(FreeCAD+POV-Rayによる木工設計スタジオ、tanei-studio/。
// freecad-studio/を複製してTANE:iに組み込んだ本番の実体)との双方向データ同期。
// 設計スタジオはfreecadcmd/povrayというローカルバイナリに依存するため、このNext.jsアプリが
// Vercel等にデプロイされていてもサーバー側から直接アクセスすることはできない。そのため同期は
// ブラウザ側のJavaScriptが、オペレーターの同じPC上で起動している設計スタジオ
// (http://localhost:5002、app/app/studio/でiframe埋め込み表示する)のWebSocketエンドポイントへ
// 直結する形で行う（設計スタジオがローカルで起動していない環境では、単に接続が確立されない
// だけでエラーにはならない）。
import type { StudioSpec } from './studioSpec';

const STUDIO_SYNC_WS_URL = 'ws://localhost:5002/ws/sync';

let socket: WebSocket | null = null;
const updateListeners = new Set<(spec: StudioSpec) => void>();

function ensureSocket(): WebSocket | null {
  if (typeof window === 'undefined') return null;
  if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
    return socket;
  }
  try {
    const ws = new WebSocket(STUDIO_SYNC_WS_URL);
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
