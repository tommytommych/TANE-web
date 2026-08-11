'use client';

import Link from 'next/link';
import Card from '../ui/Card';
import SectionTitle from '../ui/SectionTitle';
import type { SavedItemType } from '../../lib/types';

interface LeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  remainingCount: number;
  remainingImageCount: number;
  onSendMessage: (text: string, countUp?: boolean) => void;
  onDownloadBlankCutSheet: () => void;
  isGeneratingPdf: boolean;
  onOpenModal: (type: SavedItemType) => void;
  onConsumeImageUsage: () => boolean;
}

const MY_PAGE_ITEMS: { icon: string; label: string; type: SavedItemType }[] = [
  { icon: '⭐', label: 'お気に入り', type: 'favorite' },
  { icon: '💾', label: '保存した設計・アイデア', type: 'design' },
  { icon: '🧊', label: '保存した設計（ブラウザCAD）', type: 'cadProject' },
  { icon: '📏', label: '木取り図', type: 'cutlist' },
  { icon: '📄', label: '保存したPDF', type: 'pdf' },
  { icon: '🖼️', label: '保存した画像', type: 'image' },
  { icon: '🏆', label: '完成作品', type: 'finished' },
  { icon: '🕒', label: '相談履歴', type: 'history' },
];

const QUICK_START_ITEMS = [
  { icon: '💬', label: 'DIY相談', desc: 'まずは気軽に相談する', message: 'DIYの相談をしたいです' },
  {
    icon: '📐',
    label: '設計する',
    desc: 'イメージから設計案を作る',
    message: '作品の設計を手伝ってほしいです。大まかなイメージから具体的な設計案を提案してください。',
  },
  { icon: '📋', label: '木取り図', desc: '必要な部材を整理する', message: '木取り図を作ってほしいです' },
  { icon: '🪵', label: '木材リスト', desc: '種類と価格を見る', message: 'コーナンの木材の種類と価格リストを教えて' },
];

const MENU_ITEMS = [
  { icon: '🔧', label: 'おすすめ工具', message: '初心者におすすめの工具を教えて' },
  { icon: '🔍', label: '木材の選び方', message: '木材の選び方を箇条書きで教えて' },
  {
    icon: '✂️',
    label: 'シルエットカメオデザイン',
    message: '【カッティングデザインの相談】シルエットカメオ用のステッカーやロゴのデザインアイデアを提案してください。',
  },
];

export default function LeftSidebar({
  isOpen,
  onClose,
  remainingCount,
  remainingImageCount,
  onSendMessage,
  onDownloadBlankCutSheet,
  isGeneratingPdf,
  onOpenModal,
  onConsumeImageUsage,
}: LeftSidebarProps) {
  return (
    <>
      {/* モバイル時、開いている間だけ表示するバックドロップ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] bg-tanei-surface-muted border-r border-tanei-border flex flex-col justify-between overflow-y-auto flex-shrink-0 transition-transform duration-300 lg:static lg:z-auto lg:transition-[width] ${
          isOpen ? 'translate-x-0 lg:w-80' : '-translate-x-full lg:w-0'
        }`}
      >
        <div
          className={`p-4 sm:p-5 flex flex-col h-full ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none lg:opacity-100 lg:pointer-events-auto'} transition-opacity duration-200`}
        >
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-tanei-brand to-[#A3856A] p-4 rounded-tanei-card shadow-md text-white">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-black tracking-wider flex items-center gap-2 drop-shadow">
                  <span>🌱</span> TANE:i
                </h1>
                <button
                  onClick={onClose}
                  className="lg:hidden text-white/80 hover:text-white text-xl leading-none"
                  aria-label="サイドバーを閉じる"
                >
                  ✕
                </button>
              </div>
              <a
                href="https://www.youtube.com/@tomishin_channel_DIY"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/90 mt-1.5 block hover:underline font-medium"
              >
                とみしんチャンネルDIY 公認アシスタント ＞
              </a>
            </div>

            {/* LINE公式アカウント連携ボタン */}
            <a
              href="https://line.me/R/ti/p/@mdo9046l"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#06C755] hover:bg-[#05b34c] text-white p-3 rounded-tanei-control font-bold text-sm shadow-md transition-all"
            >
              <span className="text-lg">💚</span>
              <span>LINE公式アカウントで相談する</span>
            </a>

            <div className="grid grid-cols-2 gap-2.5">
              <Card padding="sm" muted>
                <div className="text-xs font-bold leading-tight text-tanei-ink">
                  本日の無料相談
                  <br />
                  {remainingCount} / 10回
                </div>
                <div className="w-full bg-tanei-border h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-tanei-brand h-full transition-all duration-300"
                    style={{ width: `${(remainingCount / 10) * 100}%` }}
                  ></div>
                </div>
              </Card>

              <Card padding="sm" muted>
                <div className="text-xs font-bold leading-tight text-tanei-ink">
                  本日のAI機能利用
                  <br />
                  {remainingImageCount} / 5回
                </div>
                <div className="w-full bg-tanei-border h-2 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 h-full transition-all duration-300"
                    style={{ width: `${(remainingImageCount / 5) * 100}%` }}
                  ></div>
                </div>
              </Card>
            </div>

            {/* はじめる（カードUI） */}
            <div>
              <SectionTitle icon="⚡" className="px-1 mb-2 normal-case">
                はじめる
              </SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_START_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => onSendMessage(item.message, false)}
                    className="text-left bg-tanei-surface hover:bg-white border border-tanei-border rounded-tanei-card p-3 shadow-sm hover:shadow-md transition-all group"
                  >
                    <span className="text-xl block mb-1">{item.icon}</span>
                    <span className="text-sm font-bold text-tanei-ink block group-hover:text-tanei-brand">
                      {item.label}
                    </span>
                    <span className="text-xs text-tanei-ink-muted block mt-0.5">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2.5 border-t border-tanei-border flex flex-col gap-1.5">
              <SectionTitle className="px-3 mb-1 normal-case">メニュー</SectionTitle>

              {MENU_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => onSendMessage(item.message, false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-tanei-control text-sm bg-tanei-surface hover:bg-white border border-transparent hover:border-tanei-border text-tanei-ink transition-colors w-full text-left"
                >
                  <span>{item.icon}</span> {item.label}
                </button>
              ))}

              <Link
                href="/app/studio"
                onClick={(e) => {
                  // 完成イメージ・カット申込書PDF・写真AI空間診断と同じ「本日のAI機能利用」の
                  // 対象とする。上限到達時は遷移自体をキャンセルする（トーストはonConsumeImageUsage内で表示）
                  if (!onConsumeImageUsage()) {
                    e.preventDefault();
                    return;
                  }
                  onClose();
                }}
                title="パソコン専用機能です"
                className="flex items-center gap-3 px-3 py-2.5 rounded-tanei-control text-sm bg-tanei-surface hover:bg-white border border-transparent hover:border-tanei-border text-tanei-ink transition-colors w-full text-left"
              >
                <span>🪚</span>
                <span className="flex flex-col leading-tight">
                  <span>TANE:i 設計スタジオ</span>
                  <span className="text-[10px] font-normal text-tanei-ink-muted">※パソコン専用機能です</span>
                </span>
              </Link>

              {/* ブラウザCAD（React Three Fiber）はPC不要でスマホからも使えるため、
                  設計スタジオ（FreeCAD版）とは別枠のリンクにしている。サーバー負荷が
                  ないため「本日のAI機能利用」の消費対象にもしていない */}
              <Link
                href="/app/cad"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-tanei-control text-sm bg-tanei-surface hover:bg-white border border-transparent hover:border-tanei-border text-tanei-ink transition-colors w-full text-left"
              >
                <span>🧊</span>
                <span className="flex flex-col leading-tight">
                  <span>TANE:i ブラウザCAD</span>
                  <span className="text-[10px] font-normal text-tanei-ink-muted">※試験提供中</span>
                </span>
              </Link>

              <div className="mt-1.5 pt-2.5 border-t border-tanei-border">
                <button
                  onClick={onDownloadBlankCutSheet}
                  disabled={isGeneratingPdf}
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-tanei-control text-sm text-white font-bold transition-all shadow-sm w-full disabled:opacity-50 bg-tanei-accent hover:bg-tanei-accent-dark"
                >
                  {isGeneratingPdf ? 'PDF作成中...' : 'TANE:iカット申込書PDF出力'}
                </button>
                <div className="text-xs text-tanei-ink-muted px-1 mt-1.5 leading-tight">
                  コーナン・カインズ・コメリなど主要ホームセンター共通で使える1枚です
                </div>
              </div>
            </div>

            <div className="pt-2.5 border-t border-tanei-border flex flex-col gap-1.5">
              <SectionTitle icon="👤" className="px-3 mb-1 normal-case">
                マイページ
              </SectionTitle>
              {MY_PAGE_ITEMS.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onOpenModal(item.type)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-tanei-control text-sm bg-tanei-surface hover:bg-white border border-transparent hover:border-tanei-border text-tanei-ink transition-colors w-full text-left"
                >
                  <span>{item.icon}</span> {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
