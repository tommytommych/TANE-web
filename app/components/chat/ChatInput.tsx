'use client';

import type { RefObject } from 'react';

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  isLoading: boolean;
  selectedImage: string | null;
  onSelectImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onOpenCompletionImage: () => void;
}

export default function ChatInput({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  isLoading,
  selectedImage,
  onSelectImage,
  onClearImage,
  fileInputRef,
  onOpenCompletionImage,
}: ChatInputProps) {
  return (
    <div className="p-3 sm:p-5 bg-white border-t border-tanei-border">
      {selectedImage && (
        <div className="mb-2 flex items-center gap-3 bg-tanei-surface-muted p-2 rounded-tanei-control border border-tanei-border w-fit max-w-full">
          {/* base64のdata URL（外部URLではない一時プレビュー）のためnext/imageの最適化対象外。意図的にimgタグを使用 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedImage} alt="添付写真" className="h-12 w-12 object-cover rounded-lg flex-shrink-0" />
          <div className="text-xs min-w-0">
            <span className="font-bold text-tanei-ink block">📷 写真を添付中（写真で相談）</span>
            <span className="text-gray-500 hidden sm:block">この写真をもとにAIに相談できます</span>
          </div>
          <button onClick={onClearImage} className="text-xs text-red-500 font-bold ml-2 sm:ml-4 flex-shrink-0 hover:underline">
            取り消し
          </button>
        </div>
      )}

      <p className="text-[11px] text-tanei-ink-muted mb-1.5 sm:mb-2">
        ⚠️ 完成イメージ・設計スタジオはパソコンでのご利用専用です（スマートフォンでは別途接続設定が必要です）
      </p>

      <div className="w-full max-w-none flex gap-1.5 sm:gap-2 items-center">
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={onSelectImage}
          className="hidden"
          aria-label="相談用の写真を選択"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-gradient-to-r from-tanei-brand to-tanei-accent text-white px-3 sm:px-4 py-3 rounded-tanei-control text-sm font-bold shadow-sm hover:brightness-105 transition-all flex items-center gap-1.5 flex-shrink-0"
          title="お部屋や置きたい場所の写真をアップロードしてAI空間診断"
          aria-label="写真でAI診断"
        >
          <span>📷</span>
          <span className="hidden sm:inline">写真でAI診断</span>
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="例：テレビ台を作りたい、隙間に合う収納棚のサイズは？、など"
          disabled={isLoading}
          className="flex-1 border border-tanei-border rounded-tanei-control px-3 sm:px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand disabled:opacity-50 min-w-0"
        />

        <button
          onClick={onSend}
          disabled={isLoading}
          className="bg-tanei-brand text-white px-4 sm:px-6 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors disabled:opacity-50 flex-shrink-0"
        >
          送信
        </button>

        <button
          onClick={onOpenCompletionImage}
          disabled={isLoading}
          className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shadow-indigo-500/25 px-3 sm:px-5 py-3 rounded-tanei-control text-sm font-bold hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex-shrink-0 flex items-center gap-1.5 border border-white/20"
          title="TANE:i 設計スタジオで完成イメージを見る（パソコン専用機能です）"
        >
          <span>✨</span>
          <span className="hidden sm:inline">完成イメージ</span>
        </button>
      </div>
    </div>
  );
}
