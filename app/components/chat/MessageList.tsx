'use client';

import { memo, type RefObject } from 'react';
import MessageBubble from './MessageBubble';
import type { Message, MaterialGroup, SheetLayout, AssemblyManual } from '../../lib/cutlist';
import type { SavedItemType } from '../../lib/types';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isAnalyzingPhoto: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onOpenGeminiImage: (prompt: string) => void;
  onSendMessage: (text: string, countUp?: boolean) => void;
  onDownloadCutSheet: (materialGroups?: MaterialGroup[], sheetLayouts?: SheetLayout[], itemName?: string) => void;
  onDownloadAssemblyManual: (manual?: AssemblyManual) => void;
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

function MessageList({
  messages,
  isLoading,
  isAnalyzingPhoto,
  messagesEndRef,
  onOpenGeminiImage,
  onSendMessage,
  onDownloadCutSheet,
  onDownloadAssemblyManual,
  isGeneratingPdf,
  addItem,
  showToast,
  onFocusChatInput,
}: MessageListProps) {
  return (
    <div className="w-full max-w-none space-y-4">
      {messages.map((msg, index) => (
        <MessageBubble
          key={index}
          msg={msg}
          index={index}
          isLatest={index === messages.length - 1}
          onOpenGeminiImage={onOpenGeminiImage}
          onSendMessage={onSendMessage}
          onDownloadCutSheet={onDownloadCutSheet}
          onDownloadAssemblyManual={onDownloadAssemblyManual}
          isGeneratingPdf={isGeneratingPdf}
          addItem={addItem}
          showToast={showToast}
          onFocusChatInput={onFocusChatInput}
        />
      ))}

      {isLoading && isAnalyzingPhoto && (
        <div className="flex justify-start">
          <div className="bg-gradient-to-r from-tanei-accent/10 to-tanei-brand/10 border border-tanei-accent/30 text-tanei-ink p-4 rounded-2xl text-sm animate-pulse flex items-center gap-2 shadow-sm">
            <span>🔍</span>
            <span className="font-bold">写真AI空間診断中… 家具・壁・床・収納スペースを解析しています</span>
          </div>
        </div>
      )}

      {isLoading && !isAnalyzingPhoto && (
        <div className="flex justify-start">
          <div className="bg-white border border-tanei-border text-tanei-ink-muted p-4 rounded-2xl text-sm animate-pulse flex items-center gap-2 shadow-sm">
            <span>🌱</span>
            <span>TANE:iがDIYプランを考えています…</span>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

export default memo(MessageList);
