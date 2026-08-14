'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import {
  type Message,
  type MaterialGroup,
  type SheetLayout,
  extractCutListFromContent,
  extractSheetLayoutFromContent,
  extractContextFromContent,
  extractStudioSpecFromContent,
  stripInternalBlocks,
} from '../../lib/cutlist';
import type { SavedItemType } from '../../lib/types';
import { CAD_INITIAL_DESIGN_SESSION_KEY } from '../../lib/studioSpec';

interface CompletionCardsProps {
  msg: Message;
  onDownloadCutSheet: (materialGroups?: MaterialGroup[], sheetLayouts?: SheetLayout[], itemName?: string) => void;
  isGeneratingPdf: boolean;
  addItem: (
    type: SavedItemType,
    title: string,
    content: string,
    file?: { dataUrl: string; mimeType: string }
  ) => void;
  showToast: (msg: string) => void;
}

// 「完成しました！」画面：設計提案が出そろった直後に表示する、次のアクションのカード一覧
function CompletionCards({
  msg,
  onDownloadCutSheet,
  isGeneratingPdf,
  addItem,
  showToast,
}: CompletionCardsProps) {
  // メッセージ本文から一度だけ抽出し、各カードのクリックハンドラで使い回す
  const materialGroups = useMemo(() => extractCutListFromContent(msg.content), [msg.content]);
  const sheetLayouts = useMemo(() => extractSheetLayoutFromContent(msg.content), [msg.content]);
  const context = useMemo(() => extractContextFromContent(msg.content), [msg.content]);
  const studioSpec = useMemo(() => extractStudioSpecFromContent(msg.content), [msg.content]);

  const handleLineShare = () => {
    const text = stripInternalBlocks(msg.content).slice(0, 300);
    const shareText = `${text}\n\n— TANE:iで作成`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`, '_blank');
  };

  const handleShare = async () => {
    const text = stripInternalBlocks(msg.content).slice(0, 500);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'TANE:iの設計', text });
      } catch {
        // ユーザーによるキャンセル等は何もしない
      }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('内容をコピーしました！お好きな方法で共有してください。');
    }
  };

  // シルエットカメオ（カッティングマシン）の相談では、木材ではなくカッティング用品を検索する
  const isCameoContent = /カメオ|カッティングデザイン/.test(msg.content);

  const handleAmazonSearch = () => {
    const query = isCameoContent
      ? 'シルエットカメオ カッティングシート'
      : context?.item
      ? `${context.item} 木材 DIY`
      : 'DIY 木材 工具';
    window.open(`https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`, '_blank');
  };

  const handleSaveDesign = () => {
    addItem('design', '保存した設計・アイデア', stripInternalBlocks(msg.content));
    showToast('設計・アイデアとして保存しました！');
  };

  // 「PDF」はファイル形式であって利用者が知りたい「何に使うものか」を表さないため、
  // 「カット申込書」（ホームセンターなどにカットを依頼するための書類）と表示する。
  // 内部のダウンロード処理・生成ロジック（onDownloadCutSheet）自体は変更しない。
  // シルエットカメオの相談にはカット申込書が関係ないため、この相談ではボタンを出さない
  const cards: { icon: string; label: string; onClick: () => void; accent?: boolean; disabled?: boolean; title?: string }[] = [
    ...(isCameoContent
      ? []
      : [
          {
            icon: isGeneratingPdf ? '⏳' : '📝',
            label: isGeneratingPdf ? '生成中…' : 'カット申込書',
            onClick: () => onDownloadCutSheet(materialGroups ?? undefined, sheetLayouts ?? undefined, context?.item ?? undefined),
            accent: true,
            disabled: isGeneratingPdf,
          },
        ]),
    { icon: '💾', label: '保存', onClick: handleSaveDesign },
    { icon: '🔗', label: '共有', onClick: handleShare },
    { icon: '🛒', label: 'Amazon', onClick: handleAmazonSearch },
  ];

  return (
    <div className="w-full mt-2 ml-1 max-w-xl">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🎉</span>
        <span className="text-sm font-bold text-tanei-ink">完成しました！次のアクションを選んでください</span>
      </div>

      {/* 天板・底板・側板・背板からなる箱型の家具のみ、AIがtanei-studio-specブロックを
          出力する。TANE:iの設計入口は「TANE:i 3D家具設計」（/app/cad）1つだけで、
          家具設計・3D確認・材料設定・木取り・カット申込書までをすべてここで行う
          （Phase E：旧設計スタジオ／FreeCAD+POV-Ray版の/app/studioは廃止済み） */}
      {studioSpec && (
        <div className="flex flex-col gap-1.5 mb-2">
          {/* Phase 4-07：クリック時、既存のstudioSpec（AIが提案した確定仕様、変更しない）を
              一時的にsessionStorageへ書き込んでから/app/cadへ遷移する。CadPageShell.tsx側が
              マウント時に読み取り、既存のinitialDesignプロパティ（CadStudio.tsxに元々ある、
              新規propsの追加はしていない）へFurnitureDesignへ変換して渡す。書き込みに
              失敗しても（プライベートブラウジング等）遷移自体は妨げず、CAD側は既存どおり
              デフォルト設計にフォールバックするだけなので安全 */}
          <Link
            href="/app/cad"
            onClick={() => {
              try {
                sessionStorage.setItem(CAD_INITIAL_DESIGN_SESSION_KEY, JSON.stringify(studioSpec));
              } catch (e) {
                console.error(e);
              }
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-tanei-card border border-tanei-brand bg-tanei-brand-soft text-tanei-ink hover:border-tanei-brand-dark transition-colors"
          >
            <span className="text-lg flex-shrink-0">🌿</span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="text-xs font-bold">TANE:i 3D家具設計</span>
              <span className="text-[10px] text-tanei-ink-muted">この家具を3Dで確認・編集します</span>
              <span className="text-[10px] text-tanei-ink-muted">AI提案の寸法（幅・奥行・高さ・板厚）をそのまま引き継ぎます</span>
            </span>
          </Link>
        </div>
      )}

      <div className={`grid gap-2 ${isCameoContent ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={card.onClick}
            disabled={card.disabled}
            title={card.title}
            className={`flex flex-col items-center justify-center gap-1 p-3 rounded-tanei-card border transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed ${
              card.accent
                ? 'bg-tanei-accent text-white border-tanei-accent hover:bg-tanei-accent-dark'
                : 'bg-white text-tanei-ink border-tanei-border hover:border-tanei-brand'
            }`}
          >
            <span className="text-xl">{card.icon}</span>
            <span className="text-xs font-bold">{card.label}</span>
          </button>
        ))}
      </div>

      {/* LINE送信は制作の必須工程ではないため、主要アクションと同じ重みのボタンとしては
          並べない（初心者が「LINEに送らないと進めないのか」と誤解しないように）。
          機能自体は削除せず、カット申込書の下に控えめな補助リンクとして残す */}
      <div className="mt-1.5 flex justify-end">
        <button type="button" onClick={handleLineShare} className="text-[11px] text-tanei-ink-muted hover:text-tanei-brand underline">
          💚 LINEで送る
        </button>
      </div>
    </div>
  );
}

export default memo(CompletionCards);
