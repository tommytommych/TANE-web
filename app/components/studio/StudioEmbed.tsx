'use client';

import Link from 'next/link';

// TANE:i設計スタジオ（tanei-studio/）はFreeCAD/POV-Rayというローカルバイナリに依存するため、
// TANE:i本体のサーバーレス環境（Vercel等）上では動かせず、オペレーターの手元PCで
// 別プロセス（Flask、既定ポート5002）として起動しておく必要がある。このページはその
// ローカルサーバーをiframeで埋め込んでいるだけで、iframeの読み込み失敗はクロスオリジンの
// 制約上JSから確実には検知できないため、常時表示の案内文でサーバー起動を促す
const STUDIO_URL = 'http://localhost:5002';

export default function StudioEmbed() {
  return (
    <div className="flex flex-col h-dvh bg-tanei-bg">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tanei-border bg-white flex-shrink-0">
        <Link
          href="/app"
          className="text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand flex-shrink-0"
        >
          ← チャットに戻る
        </Link>
        <span className="text-sm font-black text-tanei-brand truncate">🌱 TANE:i 設計スタジオ</span>
      </div>

      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex-shrink-0 leading-relaxed">
        ⚠ この機能を使うには、オペレーターの手元PCで設計スタジオのサーバー（FreeCAD・POV-Ray）を
        起動しておく必要があります（<code className="bg-white px-1 rounded">cd tanei-studio &amp;&amp; python3 server.py</code>）。
        下が真っ白のまま表示されない場合は、サーバーが起動しているかご確認ください。
      </div>

      <iframe src={STUDIO_URL} title="TANE:i 設計スタジオ" className="flex-1 w-full border-0" />
    </div>
  );
}
