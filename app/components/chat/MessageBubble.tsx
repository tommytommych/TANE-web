'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getMarkdownComponents } from '../../lib/markdown';
import {
  type Message,
  type MaterialGroup,
  type SheetLayout,
  type AssemblyManual,
  extractCameoDesignsFromContent,
  extractOptionsFromContent,
  stripInternalBlocks,
} from '../../lib/cutlist';
import type { SavedItemType } from '../../lib/types';
import CameoDesignGallery from './CameoDesignGallery';
import CompletionCards from './CompletionCards';

interface MessageBubbleProps {
  msg: Message;
  index: number;
  isLatest: boolean;
  onOpenGeminiImage: (prompt: string) => void;
  onSendMessage: (text: string, countUp?: boolean) => void;
  onDownloadCutSheet: (materialGroups?: MaterialGroup[], sheetLayouts?: SheetLayout[], itemName?: string) => void;
  onDownloadAssemblyManual: (manual?: AssemblyManual) => void;
  onConsumeImageUsage: () => boolean;
  isGeneratingPdf: boolean;
  addItem: (
    type: SavedItemType,
    title: string,
    content: string,
    file?: { dataUrl: string; mimeType: string }
  ) => void;
  showToast: (msg: string) => void;
  onFocusChatInput: () => void;
}

// AIが提示する選択肢の最後には、必ず「自由に入力する」（自由入力を促す文言）が付く
// （systemPrompt.ts参照）。これはユーザーからの実際の回答ではないため、他の選択肢のように
// そのままメッセージとして送信すると、AIが具体的な回答を得られず同じ質問を繰り返してしまう
// （実際に報告された不具合）。クリックされたら送信せず、チャット入力欄にフォーカスするだけにする
const isFreeInputOption = (option: string) => option.includes('自由') && option.includes('入力');

const renderMessageContent = (content: string, isUser: boolean) => {
  if (!content) return null;
  const visibleContent = stripInternalBlocks(content);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents(isUser)}>
      {visibleContent}
    </ReactMarkdown>
  );
};

function MessageBubble({
  msg,
  index,
  isLatest,
  onOpenGeminiImage,
  onSendMessage,
  onDownloadCutSheet,
  onConsumeImageUsage,
  isGeneratingPdf,
  addItem,
  showToast,
  onFocusChatInput,
}: MessageBubbleProps) {
  // メッセージ本文が変わらない限り再計算しない（同じ内容を親の再レンダーのたびに
  // JSON.parseし直したり、シート材の自動配置を再計算したりする無駄を避ける）
  const options = useMemo(
    () => (msg.role === 'assistant' ? extractOptionsFromContent(msg.content) : null),
    [msg.role, msg.content]
  );
  const cameoDesigns = useMemo(
    () => (msg.role === 'assistant' ? extractCameoDesignsFromContent(msg.content) : null),
    [msg.role, msg.content]
  );
  const imageUrl = msg.image;

  return (
    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      <div
        className={`p-4 rounded-2xl text-sm ${
          msg.role === 'user'
            ? 'max-w-[80%] bg-tanei-brand text-white ml-auto'
            : msg.isError
            ? 'max-w-5xl w-full bg-orange-50 border border-orange-200 text-tanei-ink mr-auto shadow-sm'
            : 'max-w-5xl w-full bg-white border border-tanei-border text-tanei-ink mr-auto shadow-sm'
        }`}
      >
        {imageUrl && (
          <div className="mb-3">
            {/* base64のdata URL（外部URLではない一時プレビュー）のためnext/imageの最適化対象外。意図的にimgタグを使用 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="相談写真" className="max-h-48 rounded-xl object-cover border border-white/20 shadow-sm" />
            <button
              onClick={() => {
                const mimeType = imageUrl.match(/^data:(.+?);/)?.[1] ?? 'image/jpeg';
                addItem('image', '相談写真', '', { dataUrl: imageUrl, mimeType });
                showToast('画像を保存しました！');
              }}
              className={`mt-1.5 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
                msg.role === 'user'
                  ? 'bg-white/20 hover:bg-white/30 text-white'
                  : 'bg-tanei-brand-soft hover:bg-tanei-border text-tanei-ink'
              }`}
            >
              🖼️ この画像を保存
            </button>
          </div>
        )}
        {/* 木取り図（tanei-sheetlayoutブロックのSVG表示）はチャット内には表示しない。
            設計が確定した後のブラウザCAD（/app/cad、木取り図画面）を唯一の正式な表示場所と
            するため（材料ごとの木取り図・カットリストとの二重表示を避ける）。AIの回答文章
            （設計概要・材料の簡潔な説明）はrenderMessageContentでそのまま表示され続ける */}
        <div className="mb-2">{renderMessageContent(msg.content, msg.role === 'user')}</div>
        {cameoDesigns && <CameoDesignGallery designs={cameoDesigns} onOpenGeminiImage={onOpenGeminiImage} />}
      </div>

      {/* AIからの返答取得に失敗した場合：再送信ボタンを出す */}
      {msg.isError && msg.retryText && (
        <button
          onClick={() => onSendMessage(msg.retryText as string, false)}
          className="mt-2 ml-1 text-xs font-bold bg-white border border-orange-300 text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
        >
          <span>🔄</span> もう一度送信する
        </button>
      )}

      {/* AIが質問中：ワンタップで回答できる選択肢ボタンを優先表示 */}
      {options && isLatest && (
        <div className="flex flex-wrap gap-2 mt-2 ml-1">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => (isFreeInputOption(opt) ? onFocusChatInput() : onSendMessage(opt, true))}
              className="text-xs font-bold bg-tanei-accent/10 hover:bg-tanei-accent hover:text-white text-tanei-accent border border-tanei-accent/30 px-3 py-1.5 rounded-full transition-all"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* 設計提案が出そろった後の「完成しました！」カード画面（質問中・エラー時は表示しない） */}
      {msg.role === 'assistant' && index !== 0 && !options && !msg.isError && (
        <CompletionCards
          msg={msg}
          onDownloadCutSheet={onDownloadCutSheet}
          onConsumeImageUsage={onConsumeImageUsage}
          isGeneratingPdf={isGeneratingPdf}
          addItem={addItem}
          showToast={showToast}
        />
      )}
    </div>
  );
}

export default memo(MessageBubble);
