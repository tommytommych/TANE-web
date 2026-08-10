'use client';

import { memo, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { pushSpecToStudio } from '../../lib/studioSync';
import { STUDIO_IS_CLOUD_HOSTED } from '../../lib/studioBaseUrl';

interface CompletionCardsProps {
  msg: Message;
  onDownloadCutSheet: (materialGroups?: MaterialGroup[], sheetLayouts?: SheetLayout[]) => void;
  onConsumeImageUsage: () => boolean;
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
  onConsumeImageUsage,
  isGeneratingPdf,
  addItem,
  showToast,
}: CompletionCardsProps) {
  const router = useRouter();

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

  const handleOpenInStudio = () => {
    if (!studioSpec) return;
    // 設計スタジオでの完成イメージ生成も「本日のAI機能利用」の対象とする
    // （上限到達時はonConsumeImageUsage内でトーストを出して遷移しない）
    if (!onConsumeImageUsage()) return;
    // 遷移前に送信しておくことで、/app/studioのiframeが接続する頃には
    // サーバー（tanei-studio/server.py）側に最新仕様が反映されている
    pushSpecToStudio(studioSpec);
    router.push('/app/studio');
  };

  const cards: { icon: string; label: string; onClick: () => void; accent?: boolean; disabled?: boolean; title?: string }[] = [
    // シルエットカメオの相談には木取り図PDFが関係ないため、この相談ではPDFボタンを出さない
    ...(isCameoContent
      ? []
      : [
          {
            icon: isGeneratingPdf ? '⏳' : '📄',
            label: isGeneratingPdf ? '生成中…' : 'PDF',
            onClick: () => onDownloadCutSheet(materialGroups ?? undefined, sheetLayouts ?? undefined),
            accent: true,
            disabled: isGeneratingPdf,
          },
        ]),
    // 天板・底板・側板・背板からなる箱型の家具のみ、AIがtanei-studio-specブロックを出力する
    ...(studioSpec
      ? [
          {
            icon: '🪚',
            label: '設計スタジオで見る',
            onClick: handleOpenInStudio,
            title: STUDIO_IS_CLOUD_HOSTED ? undefined : 'パソコン専用機能です',
          },
        ]
      : []),
    { icon: '💚', label: 'LINE送信', onClick: handleLineShare },
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

      <div className={`grid gap-2 ${isCameoContent ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-5'}`}>
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
    </div>
  );
}

export default memo(CompletionCards);
