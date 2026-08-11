'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { SavedItem, SavedItemType } from '../../lib/types';

interface SavedItemsModalProps {
  activeModal: SavedItemType | null;
  savedItems: SavedItem[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: { title?: string; content?: string }) => void;
  onAdd: (
    type: SavedItemType,
    title: string,
    content: string,
    file?: { dataUrl: string; mimeType: string }
  ) => void;
}

const MODAL_META: Record<SavedItemType, { icon: string; label: string }> = {
  favorite: { icon: '⭐', label: 'お気に入り' },
  design: { icon: '💾', label: '保存した設計・アイデア' },
  cutlist: { icon: '📏', label: '木取り図' },
  pdf: { icon: '📄', label: '保存したPDF' },
  image: { icon: '🖼️', label: '保存した画像' },
  finished: { icon: '🏆', label: '完成作品' },
  history: { icon: '🕒', label: '相談履歴' },
  cadProject: { icon: '🧊', label: '保存した設計（ブラウザCAD）' },
};

// 手動で新規保存できるのは「画像」「完成作品」（他は会話中のボタンから保存される）
const MANUAL_ADD_TYPES: SavedItemType[] = ['image', 'finished'];

export default function SavedItemsModal({ activeModal, savedItems, onClose, onRemove, onUpdate, onAdd }: SavedItemsModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [prevActiveModal, setPrevActiveModal] = useState(activeModal);
  if (activeModal !== prevActiveModal) {
    // モーダルの表示対象が切り替わったら、削除確認状態を持ち越さないようにリセットする
    // （Reactが公式に認めている「レンダー中に直接状態を調整する」パターン）
    setPrevActiveModal(activeModal);
    setDeleteConfirmId(null);
  }

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newFileDataUrl, setNewFileDataUrl] = useState<string | null>(null);
  const [newFileMimeType, setNewFileMimeType] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Escapeキーでも閉じられるようにする（モーダルの基本的なキーボード操作）
  useEffect(() => {
    if (!activeModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, onClose]);

  if (!activeModal) return null;

  const meta = MODAL_META[activeModal];
  const items = savedItems.filter((item) => item.type === activeModal);
  const canManuallyAdd = MANUAL_ADD_TYPES.includes(activeModal);

  const startEdit = (item: SavedItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
  };

  const saveEdit = () => {
    if (!editingId) return;
    onUpdate(editingId, { title: editTitle, content: editContent });
    setEditingId(null);
  };

  const resetAddForm = () => {
    setIsAdding(false);
    setNewTitle('');
    setNewContent('');
    setNewFileDataUrl(null);
    setNewFileMimeType(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setNewFileDataUrl(reader.result as string);
      setNewFileMimeType(file.type);
    };
    reader.onerror = () => {
      setFileError('画像の読み込みに失敗しました。別のファイルでお試しください。');
    };
    reader.readAsDataURL(file);
  };

  const submitAdd = () => {
    if (!newTitle.trim() || !newFileDataUrl || !newFileMimeType) return;
    onAdd(activeModal, newTitle.trim(), newContent.trim(), { dataUrl: newFileDataUrl, mimeType: newFileMimeType });
    resetAddForm();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-items-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-2xl max-h-[80vh] rounded-tanei-card shadow-xl flex flex-col overflow-hidden"
      >
        <div className="p-4 bg-tanei-surface-muted border-b border-tanei-border flex justify-between items-center">
          <h3 id="saved-items-modal-title" className="font-bold text-tanei-ink text-lg">
            {meta.icon} {meta.label}
          </h3>
          <div className="flex items-center gap-2">
            {canManuallyAdd && !isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                className="text-xs font-bold bg-tanei-accent text-white px-3 py-1.5 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
              >
                ＋新規保存
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-black font-bold px-3 py-1 rounded-tanei-control">
              ✕ 閉じる
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {canManuallyAdd && isAdding && (
            <div className="border border-tanei-accent/40 bg-tanei-accent/5 p-4 rounded-tanei-card space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="タイトル（例：完成した本棚）"
                aria-label="タイトル"
                className="w-full border border-tanei-border rounded-tanei-control px-3 py-2 text-sm"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="メモ（任意）"
                aria-label="メモ"
                rows={2}
                className="w-full border border-tanei-border rounded-tanei-control px-3 py-2 text-sm resize-none"
              />
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileSelect}
                aria-label="画像ファイルを選択"
                className="text-xs"
              />
              {fileError && <p className="text-xs text-red-500">{fileError}</p>}
              {newFileDataUrl && (
                // base64のdata URL（外部URLではない一時プレビュー）のためnext/imageの最適化対象外。意図的にimgタグを使用
                // eslint-disable-next-line @next/next/no-img-element
                <img src={newFileDataUrl} alt="プレビュー" className="max-h-32 rounded-tanei-control border border-tanei-border" />
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={resetAddForm}
                  className="text-xs font-bold px-3 py-1.5 rounded-tanei-control bg-white border border-tanei-border text-tanei-ink-muted hover:bg-tanei-surface-muted"
                >
                  キャンセル
                </button>
                <button
                  onClick={submitAdd}
                  disabled={!newTitle.trim() || !newFileDataUrl}
                  className="text-xs font-bold px-3 py-1.5 rounded-tanei-control bg-tanei-accent text-white hover:bg-tanei-accent-dark disabled:opacity-40"
                >
                  保存する
                </button>
              </div>
            </div>
          )}

          {activeModal === 'cadProject' ? (
            items.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">保存した設計はまだありません。</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="border border-tanei-border p-4 rounded-tanei-card bg-tanei-bg flex flex-col gap-2">
                  <div className="text-xs text-gray-500">最終更新：{item.date}</div>
                  <div className="text-sm font-bold text-tanei-ink">{item.title}</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/app/cad?projectId=${item.id}`}
                      onClick={onClose}
                      className="text-xs font-bold bg-tanei-accent text-white px-3 py-1.5 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
                    >
                      開く
                    </Link>

                    {deleteConfirmId === item.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-red-600">削除すると元に戻せません。</span>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="font-bold px-2 py-1 rounded-tanei-control bg-white border border-tanei-border text-tanei-ink-muted hover:bg-tanei-surface-muted"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={() => {
                            onRemove(item.id);
                            setDeleteConfirmId(null);
                          }}
                          className="font-bold px-2 py-1 rounded-tanei-control bg-red-500 text-white hover:bg-red-600"
                        >
                          削除する
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(item.id)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))
            )
          ) : items.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">まだ保存されているデータはありません。</p>
          ) : (
            items.map((item) => {
              const isEditing = editingId === item.id;
              const isImage = item.fileDataUrl && item.fileMimeType?.startsWith('image/');
              const isPdf = item.fileDataUrl && item.fileMimeType === 'application/pdf';

              return (
                <div key={item.id} className="border border-tanei-border p-4 rounded-tanei-card bg-tanei-bg flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{item.date}</span>
                    <div className="flex items-center gap-3">
                      {!isEditing && (
                        <button onClick={() => startEdit(item)} className="text-tanei-accent hover:underline font-bold">
                          編集
                        </button>
                      )}
                      <button onClick={() => onRemove(item.id)} className="text-red-500 hover:underline">
                        削除
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        aria-label="タイトルを編集"
                        className="w-full border border-tanei-border rounded-tanei-control px-3 py-2 text-sm font-bold"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        aria-label="内容を編集"
                        rows={4}
                        className="w-full border border-tanei-border rounded-tanei-control px-3 py-2 text-sm resize-y"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs font-bold px-3 py-1.5 rounded-tanei-control bg-white border border-tanei-border text-tanei-ink-muted hover:bg-tanei-surface-muted"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={saveEdit}
                          className="text-xs font-bold px-3 py-1.5 rounded-tanei-control bg-tanei-accent text-white hover:bg-tanei-accent-dark"
                        >
                          保存する
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-tanei-ink">{item.title}</div>

                      {isImage && (
                        // base64のdata URL（IndexedDB保存の画像）のためnext/imageの最適化対象外。意図的にimgタグを使用
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.fileDataUrl}
                          alt={item.title}
                          className="max-h-56 rounded-tanei-control border border-tanei-border object-contain"
                        />
                      )}

                      {isPdf && (
                        <a
                          href={item.fileDataUrl}
                          download={`${item.title}.pdf`}
                          className="inline-flex items-center gap-1.5 self-start text-xs font-bold bg-tanei-accent text-white px-3 py-1.5 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
                        >
                          📄 PDFをダウンロード
                        </a>
                      )}

                      {item.content && (
                        <div className="text-sm text-tanei-ink whitespace-pre-wrap bg-white p-3 rounded-tanei-control border border-tanei-border">
                          {item.content}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
