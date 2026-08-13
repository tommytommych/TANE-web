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

// Phase 4-01調査で判明：マイページの8項目が単純な縦一列で並んでおり、
// 「何をしたいか」からどの項目を選べばいいか判断しづらかった。Phase 4-05で、
// 項目そのもの（icon・label・type、＝onOpenModal(type)の呼び出し先）は一切変更せず、
// 「設計する」「制作・作品」「相談」という目的別の小見出しでグルーピングするだけにする
const MY_PAGE_GROUPS: { title: string; items: { icon: string; label: string; type: SavedItemType }[] }[] = [
  {
    title: '設計する',
    items: [
      { icon: '⭐', label: 'お気に入り', type: 'favorite' },
      { icon: '💾', label: '保存した設計・アイデア', type: 'design' },
      { icon: '🧊', label: '保存した設計（ブラウザCAD）', type: 'cadProject' },
    ],
  },
  {
    title: '制作・作品',
    items: [
      { icon: '📏', label: '木取り図', type: 'cutlist' },
      { icon: '📝', label: '保存したカット申込書', type: 'pdf' },
      { icon: '🖼️', label: '保存した画像', type: 'image' },
      { icon: '🏆', label: '完成作品', type: 'finished' },
    ],
  },
  {
    title: '相談',
    items: [{ icon: '🕒', label: '相談履歴', type: 'history' }],
  },
];

// チャットTOP（StartCards.tsx）を「DIYを相談」「写真からAI空間診断」の2入口に
// 絞ったことに合わせ、サイドバーの「はじめる」（DIY相談・設計する・木取り図・木材リスト）と
// 「メニュー」（おすすめ工具・木材の選び方・シルエットカメオデザイン）に分かれていた
// ショートカットを1つの「メニュー」リストに統合する。「設計する」「木取り図」はチャットTOP・
// ブラウザCADの導線と役割が重複するため外し、DIY相談・木材リストはそのまま残す
const MENU_ITEMS = [
  { icon: '💬', label: 'DIY相談', message: 'DIYの相談をしたいです' },
  { icon: '🪵', label: '木材リスト', message: 'コーナンの木材の種類と価格リストを教えて' },
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

            <div className="pt-2.5 border-t border-tanei-border flex flex-col gap-1.5">
              <SectionTitle icon="⚡" className="px-3 mb-1 normal-case">
                メニュー
              </SectionTitle>

              {MENU_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => onSendMessage(item.message, false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-tanei-control text-sm bg-tanei-surface hover:bg-white border border-transparent hover:border-tanei-border text-tanei-ink transition-colors w-full text-left"
                >
                  <span>{item.icon}</span> {item.label}
                </button>
              ))}

              {/* Phase 4-01調査で判明：この2つが同じ見た目で並んでいると、初見ユーザーは
                  何が違うのか・自分はどちらを使えばいいのか判断できなかった。TANE:iの
                  設計画面はブラウザCADのみで、完成イメージ（旧「設計スタジオ」表記）は
                  完成した姿を見るための補助機能という位置づけのため、「どちらで設計する？」
                  という2択前提の文言をやめ、マイページの「設計する」「制作・作品」と同じ
                  役割別の小見出しスタイルで「設計」「確認」に分ける。リンク先（/app/cad・
                  /app/studio）・onConsumeImageUsageによる利用回数チェック・onCloseの
                  挙動はいずれも変更していない */}
              <p className="px-3 text-[11px] font-bold text-tanei-ink-muted">設計</p>
              <Link
                href="/app/cad"
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-tanei-control text-sm bg-tanei-brand-soft hover:bg-white border border-tanei-brand/40 hover:border-tanei-brand text-tanei-ink transition-colors w-full text-left"
              >
                <span>🌿</span>
                <span className="flex flex-col leading-tight min-w-0">
                  <span className="font-bold">ブラウザCAD</span>
                  <span className="text-[10px] font-normal text-tanei-ink-muted">スマホ・PC対応／インストール不要・すぐ使える</span>
                </span>
              </Link>

              <p className="px-3 text-[11px] font-bold text-tanei-ink-muted mt-1.5">確認</p>
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
                <span>✨</span>
                <span className="flex flex-col leading-tight min-w-0">
                  <span className="font-bold">完成イメージ</span>
                  <span className="text-[10px] font-normal text-tanei-ink-muted">PC専用／写真のようなリアルな完成イメージを見る</span>
                </span>
              </Link>

              <div className="mt-1.5 pt-2.5 border-t border-tanei-border">
                <button
                  onClick={onDownloadBlankCutSheet}
                  disabled={isGeneratingPdf}
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-tanei-control text-sm text-white font-bold transition-all shadow-sm w-full disabled:opacity-50 bg-tanei-accent hover:bg-tanei-accent-dark"
                >
                  {isGeneratingPdf ? 'カット申込書を作成中…' : '📝 TANE:iカット申込書を出力'}
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
              {MY_PAGE_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-1.5">
                  <p className="px-3 text-[11px] font-bold text-tanei-ink-muted">{group.title}</p>
                  {group.items.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => onOpenModal(item.type)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-tanei-control text-sm bg-tanei-surface hover:bg-white border border-transparent hover:border-tanei-border text-tanei-ink transition-colors w-full text-left"
                    >
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
