'use client';

import Link from 'next/link';

// TANE:i設計スタジオ（tanei-studio/）はFreeCAD/POV-Rayというローカルバイナリに依存するため、
// TANE:i本体のサーバーレス環境（Vercel等）上では動かせず、オペレーターの手元PCで
// 別プロセス（Flask、既定ポート5002）として起動しておく必要がある。このページはその
// ローカルサーバーをiframeで埋め込んでいるだけ（サーバー未起動時は下部が空白になる）
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

      <iframe src={STUDIO_URL} title="TANE:i 設計スタジオ" className="flex-1 w-full border-0" />
    </div>
  );
}
