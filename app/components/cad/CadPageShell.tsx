'use client';

// /app/cad のページ本体。既存の設計スタジオ（app/components/studio/StudioEmbed.tsx）と
// 同じヘッダーの見た目（← チャットに戻るリンク＋タイトル）にして、TANE:iの中の別画面だと
// 分かるようにしている（設計スタジオだけ別アプリのような見た目にしない）。
// FreeCAD版の設計スタジオ（/app/studio、PC専用）とは別の独立実装で、
// こちらはPCを起動しておく必要がなく、ブラウザだけで完結する。

import Link from 'next/link';
import CadStudio from './CadStudio';

export default function CadPageShell() {
  return (
    <div className="flex h-dvh flex-col bg-tanei-bg">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tanei-border bg-white flex-shrink-0">
        <Link
          href="/app"
          className="text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand flex-shrink-0"
        >
          ← チャットに戻る
        </Link>
        <span className="text-sm font-black text-tanei-brand truncate">🌱 TANE:i ブラウザCAD</span>
        <span className="text-[10px] font-bold text-tanei-accent bg-tanei-accent/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
          試験提供中
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <CadStudio />
      </div>
    </div>
  );
}
