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
import {
  computeFurnitureProjectProgress,
  getBuildProgressStatus,
  getNextBuildStep,
  type BuildProgressStatus,
} from '../../lib/cad/model';

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

// 「制作進捗で絞り込む」（Phase 3-17）の選択肢。値はgetBuildProgressStatusの戻り値と一致させる
const PROGRESS_FILTER_OPTIONS: { value: BuildProgressStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'not_started', label: '未着手' },
  { value: 'building', label: '制作中' },
  { value: 'completed', label: '制作完了' },
];

// 「並び替え」（Phase 3-18）の選択肢。既存のcreatedAt/updatedAt/projectNameを読み取って
// 表示順だけを変えるもので、SavedFurnitureProjectには一切書き込まない
type CadProjectSortOption = 'updatedDesc' | 'createdDesc' | 'nameAsc';
const SORT_OPTIONS: { value: CadProjectSortOption; label: string }[] = [
  { value: 'updatedDesc', label: '最終更新が新しい順' },
  { value: 'createdDesc', label: '作成日が新しい順' },
  { value: 'nameAsc', label: '名前順' },
];

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
  // 「制作進捗で絞り込む」（Phase 3-17）。同じく画面表示の絞り込みだけに使い、
  // SavedFurnitureProjectはもちろんどこにも保存しない
  const [progressFilter, setProgressFilter] = useState<BuildProgressStatus | 'all'>('all');
  // 「並び替え」（Phase 3-18）。初期状態は「最終更新が新しい順」。表示順だけを変える
  // ローカルstateで、リロードすれば初期状態に戻って構わない（保存もしない）
  const [sortOption, setSortOption] = useState<CadProjectSortOption>('updatedDesc');
  // 「完成作品詳細」（Phase 3-19）。finished SavedItem.idを保持するだけの、読み取り専用の
  // 表示state。ここでSavedItemを書き換えることは一切ない
  const [viewingFinishedId, setViewingFinishedId] = useState<string | null>(null);
  const [prevActiveModal, setPrevActiveModal] = useState(activeModal);
  if (activeModal !== prevActiveModal) {
    // モーダルの表示対象が切り替わったら、削除確認状態を持ち越さないようにリセットする
    // （Reactが公式に認めている「レンダー中に直接状態を調整する」パターン）
    setPrevActiveModal(activeModal);
    setDeleteConfirmId(null);
    setDuplicateConfirmId(null);
    setRenamingProjectId(null);
    setSearchQuery('');
    setProgressFilter('all');
    setSortOption('updatedDesc');
    setViewingFinishedId(null);
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

  // 「設計を検索」（Phase 3-16）＋「制作進捗で絞り込む」（Phase 3-17）。検索対象は
  // SavedFurnitureProject.projectNameだが、既存の保存・複製・名前変更処理は必ず
  // item.titleをprojectNameと同じ値に保っているため、item.title（常にstring）を
  // そのままfilterするだけで安全に実現できる（不正な形式の保存データでも、titleフィールド
  // 自体は既存のSavedItem型でstring必須のためクラッシュしない）。両条件はAND。
  // 進捗判定はbuildChecklistだけを見る既存の純粋関数getBuildProgressStatusを再利用し、
  // ここで新しい判定ロジックを重複して書かない
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredCadProjectItems = items
    .filter((item) => {
      if (normalizedSearchQuery && !item.title.toLowerCase().includes(normalizedSearchQuery)) return false;
      if (progressFilter !== 'all') {
        const project = parseSavedItem(item);
        if (getBuildProgressStatus(project?.buildChecklist) !== progressFilter) return false;
      }
      return true;
    })
    // 「並び替え」（Phase 3-18）。SavedFurnitureProjectのcreatedAt/updatedAt/projectNameを
    // 読み取って表示順を決めるだけで、書き込みは一切行わない。日時が欠損・不正な保存データは
    // 0（最も古い扱い）にフォールバックし、クラッシュも一覧からの除外もしない
    .map((item) => ({ item, project: parseSavedItem(item) }))
    .sort((a, b) => {
      const dateValue = (iso: string | undefined): number => {
        if (!iso) return 0;
        const t = new Date(iso).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      const byUpdatedDesc = dateValue(b.project?.updatedAt) - dateValue(a.project?.updatedAt);
      const byCreatedDesc = dateValue(b.project?.createdAt) - dateValue(a.project?.createdAt);
      const byNameAsc = (a.project?.projectName ?? a.item.title).localeCompare(b.project?.projectName ?? b.item.title, 'ja');

      // 選択中の並び順を最優先のキーにし、同値の場合はupdatedAt→createdAt→idの順で
      // タイブレークして表示が不安定にならないようにする（新しいデータは追加しない）
      const primary = sortOption === 'updatedDesc' ? byUpdatedDesc : sortOption === 'createdDesc' ? byCreatedDesc : byNameAsc;
      if (primary !== 0) return primary;
      if (byUpdatedDesc !== 0) return byUpdatedDesc;
      if (byCreatedDesc !== 0) return byCreatedDesc;
      return a.item.id.localeCompare(b.item.id);
    })
    .map(({ item }) => item);

  // 「制作履歴」（Phase 3-18）。既存のfinished SavedItem（Phase 3-1で完成作品として
  // 保存されたもの）のうち、Phase 3-14で付与されたrelatedProjectIdが今も存在する
  // type='cadProject'アイテムを指しているものだけを対象にする。新しいtype・新しい
  // 保存データは作らず、既存のsavedItemsをその場で読み取って組み合わせているだけ。
  // 設計名は都度parseSavedItemで現在のprojectNameを取得するため、名前変更（Phase 3-15）
  // にも自動的に追従する（finished SavedItem自体は書き換えない）。並び順は、
  // finished SavedItemに保存されている実際の日時情報を新たに作らず、既存の
  // id（Date.now().toString()、保存時刻そのもの）を使って新しい順に安定ソートする
  const historyItems =
    activeModal === 'finished'
      ? items
          .filter((item) => item.relatedProjectId && savedItems.some((si) => si.type === 'cadProject' && si.id === item.relatedProjectId))
          .map((item) => {
            const cadItem = savedItems.find((si) => si.type === 'cadProject' && si.id === item.relatedProjectId)!;
            const project = parseSavedItem(cadItem);
            return { item, projectName: project?.projectName ?? cadItem.title };
          })
          .sort((a, b) => (Number(b.item.id) || 0) - (Number(a.item.id) || 0))
      : [];

  // 「完成作品詳細」（Phase 3-19）。viewingFinishedIdが指すfinished SavedItemを
  // savedItemsからその場で探すだけ（複製・キャッシュしない）。削除済みならnullになり、
  // 詳細モーダル自体を表示しない。関連する設計名も、制作履歴と同じく都度
  // parseSavedItemで取得し、削除済み・不正・未設定のいずれでもクラッシュしない
  const viewingFinishedItem = viewingFinishedId
    ? (savedItems.find((si) => si.id === viewingFinishedId && si.type === 'finished') ?? null)
    : null;
  const viewingRelatedCadItem = viewingFinishedItem?.relatedProjectId
    ? (savedItems.find((si) => si.type === 'cadProject' && si.id === viewingFinishedItem.relatedProjectId) ?? null)
    : null;
  // 「設計情報」「制作進捗」（Phase 3-20）。関連する設計が今も存在する場合だけ、
  // parseSavedItemで一度だけ読み取り、既存のcomputeFurnitureProjectProgress・
  // getBuildProgressStatus（マイページのカード表示と全く同じ関数）で進捗を求める。
  // 新しい判定ロジック・新しい保存データは一切作らない
  const viewingRelatedProject = viewingRelatedCadItem ? parseSavedItem(viewingRelatedCadItem) : null;
  const viewingRelatedProjectName = viewingRelatedProject?.projectName ?? viewingRelatedCadItem?.title ?? null;
  const viewingBuildStatus = viewingRelatedProject ? getBuildProgressStatus(viewingRelatedProject.buildChecklist) : null;
  const viewingProgress = viewingRelatedProject
    ? computeFurnitureProjectProgress(
        viewingRelatedProject.design,
        viewingRelatedProject.material,
        viewingRelatedProject.cutListChecked,
        viewingRelatedProject.buildChecklist
      )
    : null;
  // 「制作実績」（Phase 3-21）。保存設計カードと全く同じ、relatedProjectIdの完全一致
  // だけで数える単純な集計をここでも再利用する（新しい集計ロジックを重複させない）
  const viewingFinishedCount = viewingRelatedCadItem
    ? savedItems.filter((si) => si.type === 'finished' && si.relatedProjectId === viewingRelatedCadItem.id).length
    : 0;

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
    <>
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

          {/* 制作履歴（Phase 3-18）。完成作品一覧（このモーダル）の中に、既存の
              finished SavedItemのうち元の設計へたどれるものだけを、完成が新しい順に
              並べて表示する。既存の「完成作品を見る」一覧（この下）とは別の切り口で
              同じデータを見せているだけで、二重に保存するものは無い */}
          {activeModal === 'finished' && (
            <div>
              <p className="text-xs font-bold text-tanei-ink-muted mb-1">🕰 制作履歴</p>
              {historyItems.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm bg-tanei-bg rounded-tanei-control border border-tanei-border">
                  制作履歴はまだありません。
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {historyItems.map(({ item, projectName }) => {
                    const isImage = item.fileDataUrl && item.fileMimeType?.startsWith('image/');
                    return (
                      <div
                        key={item.id}
                        className="border border-tanei-border rounded-tanei-control p-3 bg-tanei-bg flex gap-3 items-start"
                      >
                        {isImage && (
                          // base64のdata URL（IndexedDB保存の画像）のためnext/imageの最適化対象外。意図的にimgタグを使用
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.fileDataUrl}
                            alt={item.title}
                            className="w-16 h-16 object-cover rounded-tanei-control border border-tanei-border flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-tanei-ink break-words">{item.title}</p>
                          <p className="text-xs text-tanei-ink-muted break-words">関連する設計：{projectName}</p>
                          <span className="inline-block text-[11px] font-bold text-tanei-brand mt-0.5">✓ 制作完了</span>
                          <p className="text-[11px] text-gray-500 mt-0.5">{item.date}</p>
                          <div className="flex gap-2 flex-wrap mt-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingFinishedId(item.id)}
                              className="text-xs font-bold bg-white border border-tanei-border text-tanei-ink px-3 py-1.5 rounded-tanei-control hover:bg-tanei-surface-muted transition-colors"
                            >
                              作品を見る
                            </button>
                            <Link
                              href={`/app/cad?projectId=${item.relatedProjectId}`}
                              onClick={onClose}
                              className="inline-flex items-center gap-1.5 text-xs font-bold bg-tanei-accent text-white px-3 py-1.5 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
                            >
                              元の設計を開く
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeModal === 'cadProject' && items.length > 0 && (
            <div className="flex flex-col gap-2">
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

              <div>
                <p className="text-xs font-bold text-tanei-ink-muted mb-1">制作進捗で絞り込む</p>
                <div className="flex flex-wrap gap-1.5">
                  {PROGRESS_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setProgressFilter(opt.value)}
                      aria-pressed={progressFilter === opt.value}
                      className={`text-xs font-bold px-3 py-1.5 rounded-tanei-control border transition-colors ${
                        progressFilter === opt.value
                          ? 'bg-tanei-brand text-white border-tanei-brand'
                          : 'bg-white text-tanei-ink-muted border-tanei-border hover:bg-tanei-surface-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="cad-project-sort" className="text-xs font-bold text-tanei-ink-muted mb-1 block">
                  並び順
                </label>
                <select
                  id="cad-project-sort"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as CadProjectSortOption)}
                  className="w-full border border-tanei-border rounded-tanei-control px-3 py-2 text-sm bg-white"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-tanei-ink-muted">保存した設計　{filteredCadProjectItems.length}件</p>
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
                // 制作進捗フィルター（Phase 3-17）と同じ判定をカード側にも表示する。
                // 「✓ 制作完了」は既に下のprogressブロックで表示されるため、そちらとの
                // 重複を避け、未着手・制作中の場合だけバッジを出す
                const buildStatus = getBuildProgressStatus(project?.buildChecklist);
                // 「次にやること」（Phase 2-9で導入した既存の純粋関数をそのまま再利用）。
                // 全10項目完了ならnullが返るため、下では制作中・未着手の場合だけ表示する
                const nextStep = project ? getNextBuildStep(project.buildChecklist) : null;
                // 「制作実績」（Phase 3-21）。既存のfinished SavedItem（savedItems）を
                // relatedProjectId === item.id の完全一致だけで数える単純な集計。
                // 新しいデータ構造・新しい保存処理は一切作らない
                const finishedCount = savedItems.filter((si) => si.type === 'finished' && si.relatedProjectId === item.id).length;
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
                          {buildStatus !== 'completed' && (
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                buildStatus === 'building'
                                  ? 'bg-tanei-accent/10 text-tanei-accent'
                                  : 'bg-tanei-surface-muted text-tanei-ink-muted'
                              }`}
                            >
                              {buildStatus === 'building' ? '制作中' : '未着手'}
                            </span>
                          )}
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

                        {!progress.isComplete && nextStep && (
                          <p className="text-xs text-tanei-ink">
                            次にやること：<span className="font-bold text-tanei-brand">{nextStep.label}</span>
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-[11px] text-tanei-ink-muted">
                      制作実績：{finishedCount > 0 ? `${finishedCount}件` : 'まだありません'}
                    </p>

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

                      {/* 完成作品詳細表示（Phase 3-19）。制作履歴に出てこない項目
                          （relatedProjectIdが無い・関連設計が削除済み等）でも、
                          既存のfinished一覧からは常に詳細を見られるようにする */}
                      {activeModal === 'finished' && (
                        <button
                          type="button"
                          onClick={() => setViewingFinishedId(item.id)}
                          className="self-start text-xs font-bold bg-white border border-tanei-border text-tanei-ink px-3 py-1.5 rounded-tanei-control hover:bg-tanei-surface-muted transition-colors"
                        >
                          作品を見る
                        </button>
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

      {/* 完成作品詳細（Phase 3-19）。既存のSavedItemsModal自体と同じ、fixed inset-0の
          バックドロップ＋role="dialog"という安全なモーダルパターンをそのまま踏襲し、
          外側のモーダルの上に重ねて表示する。読み取り専用で、SavedItemは一切書き換えない */}
      {viewingFinishedItem && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setViewingFinishedId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finished-detail-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-tanei-card shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
          >
            <div className="p-4 bg-tanei-surface-muted border-b border-tanei-border flex justify-between items-center">
              <h3 id="finished-detail-title" className="font-bold text-tanei-ink text-lg">
                完成作品詳細
              </h3>
              <button
                onClick={() => setViewingFinishedId(null)}
                className="text-gray-500 hover:text-black font-bold px-3 py-1 rounded-tanei-control"
              >
                ✕ 閉じる
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-3">
              {viewingFinishedItem.fileDataUrl && viewingFinishedItem.fileMimeType?.startsWith('image/') ? (
                // base64のdata URL（IndexedDB保存の画像）のためnext/imageの最適化対象外。意図的にimgタグを使用
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewingFinishedItem.fileDataUrl}
                  alt={viewingFinishedItem.title}
                  className="w-full max-h-72 object-contain rounded-tanei-control border border-tanei-border bg-tanei-bg"
                />
              ) : (
                <p className="text-center text-gray-400 py-8 text-sm bg-tanei-bg rounded-tanei-control border border-tanei-border">
                  完成写真はありません
                </p>
              )}

              <div>
                <p className="text-[11px] font-bold text-tanei-ink-muted">作品名</p>
                <p className="text-sm font-bold text-tanei-ink break-words">{viewingFinishedItem.title}</p>
              </div>

              {viewingFinishedItem.content && (
                <div>
                  <p className="text-[11px] font-bold text-tanei-ink-muted">メモ</p>
                  <p className="text-sm text-tanei-ink whitespace-pre-wrap break-words">{viewingFinishedItem.content}</p>
                </div>
              )}

              {viewingRelatedProjectName && (
                <div>
                  <p className="text-[11px] font-bold text-tanei-ink-muted">関連する設計</p>
                  <p className="text-sm text-tanei-ink break-words">設計名：{viewingRelatedProjectName}</p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-bold text-tanei-ink-muted">完成作品を保存した日時</p>
                <p className="text-sm text-tanei-ink">{viewingFinishedItem.date}</p>
              </div>

              {/* 設計情報・制作進捗（Phase 3-20）。関連する設計が今も存在する場合だけ表示し、
                  design/material/buildChecklistは既存のSavedFurnitureProjectを読み取るだけ。
                  ここで何かを書き換えることは一切ない */}
              {viewingRelatedCadItem && viewingRelatedProject && (
                <div className="border border-tanei-border rounded-tanei-control p-3 bg-tanei-bg flex flex-col gap-2">
                  <p className="text-xs font-bold text-tanei-ink-muted">設計情報</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <p className="text-tanei-ink-muted">幅</p>
                      <p className="font-bold text-tanei-ink">{viewingRelatedProject.design.width} mm</p>
                    </div>
                    <div>
                      <p className="text-tanei-ink-muted">奥行</p>
                      <p className="font-bold text-tanei-ink">{viewingRelatedProject.design.depth} mm</p>
                    </div>
                    <div>
                      <p className="text-tanei-ink-muted">高さ</p>
                      <p className="font-bold text-tanei-ink">{viewingRelatedProject.design.height} mm</p>
                    </div>
                    <div>
                      <p className="text-tanei-ink-muted">板厚</p>
                      <p className="font-bold text-tanei-ink">{viewingRelatedProject.design.thickness} mm</p>
                    </div>
                    <div>
                      <p className="text-tanei-ink-muted">材料</p>
                      <p className="font-bold text-tanei-ink break-words">{viewingRelatedProject.material}</p>
                    </div>
                    <div>
                      <p className="text-tanei-ink-muted">棚板</p>
                      <p className="font-bold text-tanei-ink">{viewingRelatedProject.design.shelves.length} 枚</p>
                    </div>
                    <div>
                      <p className="text-tanei-ink-muted">背板</p>
                      <p className="font-bold text-tanei-ink">{viewingRelatedProject.design.backPanel ? 'あり' : 'なし'}</p>
                    </div>
                    <div>
                      <p className="text-tanei-ink-muted">脚</p>
                      <p className="font-bold text-tanei-ink">{viewingRelatedProject.design.legs ? 'あり' : 'なし'}</p>
                    </div>
                  </div>

                  {viewingProgress && viewingBuildStatus && (
                    <div className="pt-2 border-t border-tanei-border">
                      <p className="text-[11px] font-bold text-tanei-ink-muted">制作進捗</p>
                      <p className="text-sm font-bold text-tanei-brand mt-0.5">
                        {viewingBuildStatus === 'completed'
                          ? '✓ 制作完了'
                          : viewingBuildStatus === 'building'
                            ? `制作中 ${viewingProgress.buildDone} / ${viewingProgress.buildTotal}`
                            : '未開始'}
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-tanei-ink-muted">
                    この設計の制作実績：{viewingFinishedCount > 0 ? `${viewingFinishedCount}件` : 'まだありません'}
                  </p>

                  <Link
                    href={`/app/cad?projectId=${viewingRelatedCadItem.id}`}
                    onClick={onClose}
                    className="self-start inline-flex items-center gap-1.5 text-xs font-bold bg-white border border-tanei-border text-tanei-ink px-3 py-1.5 rounded-tanei-control hover:bg-tanei-surface-muted transition-colors"
                  >
                    制作内容を見る
                  </Link>
                </div>
              )}

              {viewingRelatedCadItem && (
                <Link
                  href={`/app/cad?projectId=${viewingRelatedCadItem.id}`}
                  onClick={onClose}
                  className="self-start inline-flex items-center gap-1.5 text-sm font-bold bg-tanei-accent text-white px-4 py-2 rounded-tanei-control hover:bg-tanei-accent-dark transition-colors"
                >
                  元の設計を開く
                </Link>
              )}

              {/* 再制作導線（Phase 3-20）。元設計を直接上書きせず、既存のPhase 3-14複製処理
                  （handleDuplicateProject・duplicateConfirmId、cadProjectカードの「設計を複製」
                  と全く同じもの）をそのまま再利用する。新しい複製ロジックは作らない */}
              {viewingRelatedCadItem ? (
                <div className="border-t border-tanei-border pt-3">
                  <p className="text-[11px] font-bold text-tanei-ink-muted mb-1">再制作</p>
                  {duplicateConfirmId === viewingRelatedCadItem.id ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-tanei-ink-muted">この設計を複製しますか？元の設計はそのまま残ります。</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDuplicateConfirmId(null)}
                          disabled={isDuplicating}
                          className="text-xs font-bold px-3 py-1.5 rounded-tanei-control bg-white border border-tanei-border text-tanei-ink-muted hover:bg-tanei-surface-muted disabled:opacity-50"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={() => handleDuplicateProject(viewingRelatedCadItem)}
                          disabled={isDuplicating}
                          className="text-xs font-bold px-3 py-1.5 rounded-tanei-control bg-tanei-brand text-white hover:bg-tanei-brand-dark disabled:opacity-50"
                        >
                          {isDuplicating ? '複製中…' : '設計を複製'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-tanei-ink-muted mb-1.5">
                        この家具をもう一度作りたい場合は、元の設計を複製して新しい設計として作り直せます。
                      </p>
                      <button
                        onClick={() => setDuplicateConfirmId(viewingRelatedCadItem.id)}
                        className="self-start text-sm font-bold px-4 py-2 rounded-tanei-control bg-white border border-tanei-border text-tanei-ink hover:bg-tanei-surface-muted transition-colors"
                      >
                        🔁 この家具をもう一度作る
                      </button>
                    </>
                  )}
                </div>
              ) : viewingFinishedItem.relatedProjectId ? (
                <p className="text-xs text-tanei-ink-muted border-t border-tanei-border pt-3">
                  この家具の元の設計は削除されています
                </p>
              ) : (
                <p className="text-xs text-tanei-ink-muted border-t border-tanei-border pt-3">
                  この作品には元の設計が保存されていません
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
