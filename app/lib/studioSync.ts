// TANE:iチャットと「TANE:i Studio」(FreeCAD+POV-Rayによる木工設計スタジオ、freecad-studio/)
// との双方向データ同期。Studioはfreecadcmd/povrayというローカルバイナリに依存するため、
// このNext.jsアプリがVercel等にデプロイされていてもサーバー側からStudioへ直接アクセスすることは
// できない。そのため同期はブラウザ側のJavaScriptが、オペレーターの同じPC上で起動している
// Studio(http://localhost:5001)のWebSocketエンドポイントへ直結する形で行う
// （Studioがローカルで起動していない環境では、単に接続が確立されないだけでエラーにはならない）。
import type { StudioSpec } from './studioSpec';

const STUDIO_SYNC_WS_URL = 'ws://localhost:5001/ws/sync';
const STUDIO_ORIGIN = 'http://localhost:5001';
const CONNECT_FALLBACK_TIMEOUT_MS = 1500;

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
        // Studio側からの不正なメッセージは無視する
      }
    });
    socket = ws;
    return ws;
  } catch {
    return null;
  }
}

// Studio側で確定・保存された仕様の更新を受け取るリスナーを登録する。
// 戻り値の関数を呼ぶと登録解除できる（ReactのuseEffectのクリーンアップ用）
export function connectStudioSync(onStudioUpdate: (spec: StudioSpec) => void): () => void {
  updateListeners.add(onStudioUpdate);
  ensureSocket();
  return () => {
    updateListeners.delete(onStudioUpdate);
  };
}

function openStudioWithSpec(spec: StudioSpec) {
  const params = new URLSearchParams({
    item: spec.item,
    width: String(spec.width),
    depth: String(spec.depth),
    height: String(spec.height),
    autoRender: '1',
  });
  if (spec.thickness != null) params.set('thickness', String(spec.thickness));
  if (spec.material) params.set('material', spec.material);
  if (spec.panelFinishes) params.set('panelFinishes', JSON.stringify(spec.panelFinishes));
  window.open(`${STUDIO_ORIGIN}/?${params.toString()}`, 'tanei-studio');
}

// チャットで確定した仕様をStudioへ送る。接続済みならWebSocket経由で即座に反映され、
// 未接続（Studio未起動、または接続確立前）ならクエリパラメータ付きでStudioを新規タブで開く
export function pushSpecToStudio(spec: StudioSpec): void {
  const ws = ensureSocket();
  if (!ws) {
    openStudioWithSpec(spec);
    return;
  }

  const send = () => ws.send(JSON.stringify({ type: 'spec-update', source: 'chat', payload: spec }));

  if (ws.readyState === WebSocket.OPEN) {
    send();
    return;
  }

  if (ws.readyState === WebSocket.CONNECTING) {
    const timeoutId = setTimeout(() => {
      ws.removeEventListener('open', onOpen);
      openStudioWithSpec(spec);
    }, CONNECT_FALLBACK_TIMEOUT_MS);
    const onOpen = () => {
      clearTimeout(timeoutId);
      send();
    };
    ws.addEventListener('open', onOpen, { once: true });
    return;
  }

  openStudioWithSpec(spec);
}
