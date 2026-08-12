'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SavedItem, SavedItemType } from '../../lib/types';
import {
  parseSavedItem,
  duplicateFurnitureProject,
  saveFurnitureProject,
  formatUpdatedAtForDisplay,
  type SavedFurnitureProject,
} from '../../lib/cad/projectStore';
import { computeFurnitureProjectProgress } from '../../lib/cad/model';

interface SavedItemsModalProps {
  activeModal: SavedItemType | null;
  savedItems: SavedItem[];
  onClose: () => void;
  onRemove: (id: string) => void;
  /** 「date」は、CAD設計の名前変更（Phase 3-15）でupdatedAtが変わった際に、
   * 一覧の「最終更新：」表示も既存のtoSavedItem相当のフォーマットで合わせて
   * 更新できるようにするための任意項目。他のonUpdate呼び出し元には影響しない */
  onUpdate: (id: string, updates: { title?: string; content?: string; date?: string }) => void;
  onAdd: (
    type: SavedItemType,
    title: string,
    content: string,
    file?: { dataUrl: string; mimeType: string },
    relatedProjectId?: string
  ) => void;
  showToast?: (msg: string) => void;
  /** ブラウザCAD（Phase 3-1）の「完成作品として保存する」から遷移してきた場合のみ指定。
   * 新規保存フォームを自動的に開き、プロジェクト名をタイトルの初期値にする */
  initialAddTitle?: string;
  /** 同じくブラウザCADからの遷移時のみ指定。元になったCADプロジェクトのid（Phase 3-14）。
   * 保存済みの設計から来た場合のみ値があり、新規保存する完成作品に関連付けられる */
  initialAddRelatedProjectId?: string;
  autoOpenAdd?: boolean;
  onAutoOpenAddHandled?: () => void;
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

// 設計名を変更（Phase 3-15・名前変更）時の文字数上限。既存のCAD側「設計の名前」入力欄には
// 上限が無いが、一覧UIが崩れないようにこの機能でのみ適用する
const PROJECT_NAME_MAX_LENGTH = 60;

export default function SavedItemsModal({
  activeModal,
  savedItems,
  onClose,
  onRemove,
  onUpdate,
  onAdd,
  showToast,
  initialAddTitle,
  initialAddRelatedProjectId,
  autoOpenAdd,
  onAutoOpenAddHandled,
}: SavedItemsModalProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // 「設計を複製」の確認状態（Phase 3-15）。削除確認と同じ、既存の1件だけ選択されている
  // ローカルstateのパターンをそのまま再利用している
  const [duplicateConfirmId, setDuplicateConfirmId] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  // 「設計名を変更」のインライン編集状態（Phase 3-15・名前変更）。削除確認・複製確認と
  // 同じ、1件だけ選択されているローカルstateのパターンをそのまま再利用している
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  // 「設計を検索」の検索文字列（Phase 3-16）。どこにも保存せず、画面表示の絞り込みだけに
  // 使う純粋なローカルstate
  const [searchQuery, setSearchQuery] = useState('');
  const [prevActiveModal, setPrevActiveModal] = useState(activeModal);
  if (activeModal !== prevActiveModal) {
    // モーダルの表示対象が切り替わったら、削除確認状態を持ち越さないようにリセットする
    // （Reactが公式に認めている「レンダー中に直接状態を調整する」パターン）
    setPrevActiveModal(activeModal);
    setDeleteConfirmId(null);
    setDuplicateConfirmId(null);
    setRenamingProjectId(null);
    setSearchQuery('');
  }

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newFileDataUrl, setNewFileDataUrl] = useState<string | null>(null);
  const [newFileMimeType, setNewFileMimeType] = useState<string | null>(null);
  // ブラウザCADから完成作品として保存する際の、元プロジェクトへの関連付け（Phase 3-14）。
  // 通常の新規保存（マイページから直接「＋新規保存」した場合）ではundefinedのまま
  const [newRelatedProjectId, setNewRelatedProjectId] = useState<string | undefined>(undefined);
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

  // ブラウザCADの「完成作品として保存する」からの遷移時のみ、新規保存フォームを自動的に開き、
  // プロジェクト名をタイトルの初期値にする。既存の新規保存フォーム自体（画像・メモ入力）は変更しない
  const [prevAutoOpenAdd, setPrevAutoOpenAdd] = useState(false);
  if (Boolean(autoOpenAdd) !== prevAutoOpenAdd) {
    // レンダー中に直接調整する（他のプロパティ変化検知と同じ既存パターン）
    setPrevAutoOpenAdd(Boolean(autoOpenAdd));
    if (autoOpenAdd) {
      setIsAdding(true);
      setNewTitle(initialAddTitle ?? '');
      setNewRelatedProjectId(initialAddRelatedProjectId);
    }
  }

  // 親（呼び出し元）のstateを戻す通知だけは、レンダー中ではなくエフェクトから行う
  useEffect(() => {
    if (!autoOpenAdd) return;
    onAutoOpenAddHandled?.();
  }, [autoOpenAdd, onAutoOpenAddHandled]);

  if (!activeModal) return null;

  const meta = MODAL_META[activeModal];
  const items = savedItems.filter((item) => item.type === activeModal);
  const canManuallyAdd = MANUAL_ADD_TYPES.includes(activeModal);

  // 「設計を検索」（Phase 3-16）。検索対象はSavedFurnitureProject.projectNameだが、
  // 既存の保存・複製・名前変更処理は必ずitem.titleをprojectNameと同じ値に保っているため、
  // item.title（常にstring）をそのままfilterするだけで安全に実現できる（不正な形式の
  // 保存データでも、titleフィールド自体は既存のSavedItem型でstring必須のためクラッシュしない）
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredCadProjectItems = normalizedSearchQuery
    ? items.filter((item) => item.title.toLowerCase().includes(normalizedSearchQuery))
    : items;

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

  // 「設計を複製」（Phase 3-15）。design・materialだけを引き継いだ新規プロジェクトを
  // 既存のsaveFurnitureProjectでそのまま保存し、既存のCAD起動導線（/app/cad?projectId=…）
  // で開く。新しい保存の仕組み・新しいviewMode・新しいルートは一切作らない
  const handleDuplicateProject = async (item: SavedItem) => {
    const project = parseSavedItem(item);
    if (!project) {
      showToast?.('この設計は複製できませんでした。データを確認できません。');
      setDuplicateConfirmId(null);
      return;
    }
    setIsDuplicating(true);
    try {
      const duplicated = duplicateFurnitureProject(project);
      await saveFurnitureProject(duplicated);
      showToast?.('設計を複製しました🌱');
      router.push(`/app/cad?projectId=${duplicated.id}`);
    } catch (e) {
      console.error(e);
      showToast?.('複製に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsDuplicating(false);
      setDuplicateConfirmId(null);
    }
  };

  // 「設計名を変更」（Phase 3-15・名前変更）。SavedFurnitureProject.projectNameだけを
  // 書き換え、id・createdAt・design・material・cutListChecked・buildChecklistは
  // 一切変更しない。新しい保存関数は作らず、既存のonUpdate（updateItem、既存の
  // 「編集」フォームと同じputSavedItem経由の更新処理）をそのまま再利用する
  const handleRenameProject = (item: SavedItem) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('設計名を入力してください。');
      return;
    }
    const project = parseSavedItem(item);
    if (!project) {
      showToast?.('この設計の名前を変更できませんでした。データを確認できません。');
      setRenamingProjectId(null);
      setRenameError(null);
      return;
    }
    if (trimmed === project.projectName) {
      // 変更が無い場合は不要な更新を行わない
      setRenamingProjectId(null);
      setRenameError(null);
      return;
    }
    const now = new Date().toISOString();
    const updatedProject: SavedFurnitureProject = { ...project, projectName: trimmed, updatedAt: now };
    onUpdate(item.id, {
      title: trimmed,
      content: JSON.stringify(updatedProject),
      date: formatUpdatedAtForDisplay(now),
    });
    showToast?.('設計名を変更しました🌱');
    setRenamingProjectId(null);
    setRenameError(null);
  };

  const resetAddForm = () => {
    setIsAdding(false);
    setNewTitle('');
    setNewContent('');
    setNewFileDataUrl(null);
    setNewFileMimeType(null);
    setNewRelatedProjectId(undefined);
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
    onAdd(activeModal, newTitle.trim(), newContent.trim(), { dataUrl: newFileDataUrl, mimeType: newFileMimeType }, newRelatedProjectId);
    showToast?.(activeModal === 'finished' ? '完成作品として保存しました🌱' : '画像を保存しました🌱');
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

          {activeModal === 'cadProject' && items.length > 0 && (
            <div>
              <label htmlFor="cad-project-search" className="text-xs font-bold text-tanei-ink-muted mb-1 block">
                🔍 設計を検索
              </label>
              <input
                id="cad-project-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="設計名を検索…"
                aria-label="設計を検索"
                className="w-full border border-tanei-border rounded-tanei-control px-3 py-2 text-sm"
              />
            </div>
          )}

          {activeModal === 'cadProject' ? (
            items.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">保存した設計はまだありません。</p>
            ) : filteredCadProjectItems.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">該当する設計がありません。</p>
            ) : (
              filteredCadProjectItems.map((item) => {
                // Phase 2-7以前の保存データにはcutListChecked/buildChecklistが無いが、
                // parseSavedItem・computeFurnitureProjectProgressはどちらもそれを前提に
                // 安全に動作する（未着手として扱う。クラッシュしない）
                const project = parseSavedItem(item);
                const progress = project
                  ? computeFurnitureProjectProgress(project.design, project.material, project.cutListChecked, project.buildChecklist)
                  : null;
                const hasStarted = progress ? progress.cutListDone > 0 || progress.buildDone > 0 : false;
                const overallDone = progress ? progress.cutListDone + progress.buildDone : 0;
                const overallTotal = progress ? progress.cutListTotal + progress.buildTotal : 0;
                const overallPercent = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;
                const openLabel = progress?.isComplete ? '設計を見る' : hasStarted ? '制作を続ける' : '開く';

                return (
                  <div key={item.id} className="border border-tanei-border p-4 rounded-tanei-card bg-tanei-bg flex flex-col gap-3">
                    <div>
                      <div className="text-xs text-gray-500">最終更新：{item.date}</div>
                      {renamingProjectId === item.id ? (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => {
                              setRenameValue(e.target.value);
                              if (renameError) setRenameError(null);
                            }}
                            maxLength={PROJECT_NAME_MAX_LENGTH}
                            aria-label="設計名を編集"
                            className="w-full border border-tanei-border rounded-tanei-control px-2.5 py-1.5 text-sm font-bold"
                          />
                          {renameError && <p className="text-xs text-red-500">{renameError}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setRenamingProjectId(null);
                                setRenameError(null);
                              }}
                              className="text-xs font-bold px-2.5 py-1 rounded-tanei-control bg-white border border-tanei-border text-tanei-ink-muted hover:bg-tanei-surface-muted"
                            >
                              キャンセル
                            </button>
                            <button
                              onClick={() => handleRenameProject(item)}
                              className="text-xs font-bold px-2.5 py-1 rounded-tanei-control bg-tanei-accent text-white hover:bg-tanei-accent-dark"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-bold text-tanei-ink break-words">{item.title}</div>
                          <button
                            onClick={() => {
                              setRenamingProjectId(item.id);
                              setRenameValue(item.title);
                              setRenameError(null);
                            }}
                            className="text-[11px] font-bold text-tanei-accent hover:underline flex-shrink-0"
                          >
                            ✏️ 名前を変更
                          </button>
                        </div>
                      )}
                    </div>

                    {progress && (
                      <div className="flex flex-col gap-2">
                        {progress.isComplete ? (
                          <span className="self-start text-xs font-bold text-tanei-brand bg-tanei-brand-soft rounded-tanei-control px-2.5 py-1.5">
                            ✓ 制作完了
                          </span>
                        ) : hasStarted ? (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-tanei-ink-muted">制作進捗</span>
                              <span className="font-black text-tanei-brand">{overallPercent}%</span>
                            </div>
                            <div className="w-full bg-tanei-border h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-tanei-brand h-full transition-all duration-300"
                                style={{ width: `${overallPercent}%` }}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-0.5">
                              <div>
                                <div className="text-[11px] text-tanei-ink-muted">カットリスト</div>
                                <div className="text-xs font-bold text-tanei-ink">
                                  {progress.cutListAvailable ? `${progress.cutListDone} / ${progress.cutListTotal}` : '－'}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-tanei-ink-muted">制作チェック</div>
                                <div className="text-xs font-bold text-tanei-ink">
                                  {progress.buildDone} / {progress.buildTotal}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-tanei-ink-muted">制作進捗：未開始</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/app/cad?projectId=${item.id}`}
                        onClick={onClose}
                        className="text-xs font-bold bg-tanei-accent text-white px-3 py-1.5 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
                      >
                        {openLabel}
                      </Link>

                      {duplicateConfirmId === item.id ? (
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="text-tanei-ink-muted">この設計を複製しますか？元の設計はそのまま残ります。</span>
                          <button
                            onClick={() => setDuplicateConfirmId(null)}
                            disabled={isDuplicating}
                            className="font-bold px-2 py-1 rounded-tanei-control bg-white border border-tanei-border text-tanei-ink-muted hover:bg-tanei-surface-muted disabled:opacity-50"
                          >
                            キャンセル
                          </button>
                          <button
                            onClick={() => handleDuplicateProject(item)}
                            disabled={isDuplicating}
                            className="font-bold px-2 py-1 rounded-tanei-control bg-tanei-brand text-white hover:bg-tanei-brand-dark disabled:opacity-50"
                          >
                            {isDuplicating ? '複製中…' : '設計を複製'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDuplicateConfirmId(item.id)}
                          className="text-xs font-bold text-tanei-accent hover:underline"
                        >
                          設計を複製
                        </button>
                      )}

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
                );
              })
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

                      {/* 完成作品から元の設計へ戻る導線（Phase 3-14）。ブラウザCADの「完成作品として
                          保存する」経由で保存されたitemだけがrelatedProjectIdを持つ。既存の
                          type='cadProject'一覧（savedItems）に該当する設計がまだ残っている場合のみ
                          ボタンを表示し、削除済み・旧データの場合は安全な文言に留める（クラッシュしない） */}
                      {activeModal === 'finished' && item.relatedProjectId && (
                        savedItems.some((si) => si.type === 'cadProject' && si.id === item.relatedProjectId) ? (
                          <Link
                            href={`/app/cad?projectId=${item.relatedProjectId}`}
                            onClick={onClose}
                            className="inline-flex items-center gap-1.5 self-start text-xs font-bold bg-tanei-accent text-white px-3 py-1.5 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
                          >
                            元の設計を開く
                          </Link>
                        ) : (
                          <p className="text-xs text-tanei-ink-muted">元の設計は保存されていません</p>
                        )
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
