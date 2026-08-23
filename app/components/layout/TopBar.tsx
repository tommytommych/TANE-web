'use client';

import { LINE_ENABLED, LINE_OFFICIAL_URL } from '../../lib/lineConfig';

interface TopBarProps {
  isLeftSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewConversation: () => void;
}

export default function TopBar({ isLeftSidebarOpen, onToggleSidebar, onNewConversation }: TopBarProps) {
  return (
    <div className="h-14 bg-white border-b border-tanei-border px-5 flex items-center justify-between flex-shrink-0 gap-2 relative">
      {/* モバイル時のみ：左右のボタンの間（ヘッダー中央）にTANE:iロゴを表示する */}
      <div className="sm:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 text-sm font-black text-tanei-brand whitespace-nowrap pointer-events-none">
        <span>🌱</span> TANE:i
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleSidebar}
          aria-label={isLeftSidebarOpen ? 'サイドバーを隠す' : 'メニューを開く'}
          className="flex items-center gap-2 px-3 py-1.5 bg-tanei-surface-muted border border-tanei-border rounded-tanei-control text-xs font-bold text-tanei-ink-muted hover:bg-tanei-brand-soft transition-colors flex-shrink-0"
        >
          <span className="hidden sm:inline">{isLeftSidebarOpen ? '◀ サイドバーを隠す' : '▶ メニューを開く'}</span>
          <span className="sm:hidden">☰</span>
        </button>
        <button
          onClick={onNewConversation}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-tanei-brand text-white rounded-tanei-control text-xs font-bold hover:bg-tanei-brand-dark transition-colors flex-shrink-0"
          title="今の会話をリセットして、新しい相談を始めます"
          aria-label="新しい相談を始める"
        >
          <span>🆕</span>
          <span className="hidden sm:inline">新しい相談</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {LINE_ENABLED ? (
          <a
            href={LINE_OFFICIAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-bold px-3 py-2 rounded-tanei-control shadow-sm transition-all flex items-center gap-1.5"
          >
            <span>💚</span>
            <span>LINE公式</span>
          </a>
        ) : (
          <span
            aria-disabled="true"
            title="LINE連携は準備中です"
            className="bg-tanei-surface-muted text-tanei-ink-muted text-xs font-bold px-3 py-2 rounded-tanei-control flex items-center gap-1.5 cursor-not-allowed select-none"
          >
            <span>💚</span>
            <span>LINE公式・準備中</span>
          </span>
        )}
        <div className="text-xs text-tanei-ink-muted font-bold hidden sm:block">
          🌱 TANE:i DIYアシスタント
        </div>
      </div>
    </div>
  );
}
