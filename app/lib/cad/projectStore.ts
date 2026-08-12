// ブラウザCADの設計プロジェクト（FurnitureDesign）の保存・一覧・復元・削除。
//
// 【重要】新しいデータベースは作らない。既存のapp/lib/savedItemsStore.ts（IndexedDB
// 「tanei-saved-items」、AIチャット側の「保存した設計・アイデア」「保存した画像」等と
// 同じ仕組み）をそのまま再利用し、SavedItemTypeに'cadProject'を1種類追加しただけの
// 薄いアダプタ層にしている。
//
// 【最重要】木取り図・パーツ一覧・制作手順は保存しない。保存するのはFurnitureDesign
// （+ プロジェクト名・材料・作成/更新日時）だけで、再読み込み後は既存の
// buildFurnitureModel() → furnitureModelToSheetLayout() 等で毎回再生成する
// （Phase 2-3〜2-5で維持してきた「Panel[]が唯一の入力」という方針をここでも崩さない）。

import type { SavedItem } from '../types';
import { deleteSavedItem, loadAllSavedItems, putSavedItem } from '../savedItemsStore';
import { isValidFurnitureDesign, type FurnitureDesign } from './types';

export interface SavedFurnitureProject {
  id: string;
  version: 1;
  projectName: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  design: FurnitureDesign;
  material: string;
  /** カットリスト（Phase 2-7）のチェック状態。キーはCutListItem.id。任意項目のため、
   * Phase 2-6以前に保存されたプロジェクトには存在しない（undefinedのまま扱う） */
  cutListChecked?: Record<string, boolean>;
  /** 制作チェック（Phase 2-7）のチェック状態。キーはステップ番号（1〜10）を文字列化したもの */
  buildChecklist?: Record<string, boolean>;
  /** 設計・制作メモ（Phase 3-22）。ユーザーが自由入力する任意項目。Phase 3-22より前の
   * 保存データには存在しないため、undefinedのまま「メモなし」として扱う */
  notes?: string;
}

export const DEFAULT_FURNITURE_PROJECT_NAME = '新しい設計';

export const createNewFurnitureProjectId = (): string => `cad-${Date.now()}`;

// マイページの「最終更新：」表示や、renameのようにupdatedAtを更新する操作から
// 一貫した表示形式を再利用できるようexportしている（Phase 3-15：名前変更）
export const formatUpdatedAtForDisplay = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ja-JP') + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};

const toSavedItem = (project: SavedFurnitureProject): SavedItem => ({
  id: project.id,
  type: 'cadProject',
  title: project.projectName || DEFAULT_FURNITURE_PROJECT_NAME,
  content: JSON.stringify(project),
  date: formatUpdatedAtForDisplay(project.updatedAt),
});

// Phase 2-6以前に保存されたプロジェクトには存在しない、または壊れている可能性がある任意項目。
// 形が不正な場合は無視してundefinedとして扱う（プロジェクト全体は読み込み失敗にしない）
const parseOptionalBooleanRecord = (value: unknown): Record<string, boolean> | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, v]) => typeof v === 'boolean')) return undefined;
  return Object.fromEntries(entries) as Record<string, boolean>;
};

// content（JSON文字列）は他バージョンのデータ・ブラウザ保存領域の破損等で壊れている
// 可能性があるため、必ず構造を検証してから使う（不正な場合はnullを返し、呼び出し側で
// 「読み込めませんでした」という初心者向けメッセージを出す。アプリを落とさない）。
// マイページ（SavedItemsModal.tsx）が制作進捗を計算する際にも、同じ検証済みパース処理を
// 再利用できるようexportしている
export const parseSavedItem = (item: SavedItem): SavedFurnitureProject | null => {
  if (item.type !== 'cadProject') return null;
  try {
    const parsed: unknown = JSON.parse(item.content);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (
      typeof p.id !== 'string' ||
      typeof p.projectName !== 'string' ||
      typeof p.createdAt !== 'string' ||
      typeof p.updatedAt !== 'string' ||
      typeof p.material !== 'string' ||
      !isValidFurnitureDesign(p.design)
    ) {
      return null;
    }
    return {
      id: p.id,
      version: 1,
      projectName: p.projectName,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      design: p.design,
      material: p.material,
      cutListChecked: parseOptionalBooleanRecord(p.cutListChecked),
      buildChecklist: parseOptionalBooleanRecord(p.buildChecklist),
      notes: typeof p.notes === 'string' ? p.notes : undefined,
    };
  } catch {
    return null;
  }
};

export const saveFurnitureProject = async (project: SavedFurnitureProject): Promise<void> => {
  await putSavedItem(toSavedItem(project));
};

export const loadFurnitureProjects = async (): Promise<SavedFurnitureProject[]> => {
  const items = await loadAllSavedItems();
  return items
    .map(parseSavedItem)
    .filter((p): p is SavedFurnitureProject => p !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
};

export const loadFurnitureProject = async (id: string): Promise<SavedFurnitureProject | null> => {
  const items = await loadAllSavedItems();
  const found = items.find((item) => item.id === id && item.type === 'cadProject');
  return found ? parseSavedItem(found) : null;
};

export const deleteFurnitureProject = async (id: string): Promise<void> => {
  await deleteSavedItem(id);
};

// 「設計を複製」（Phase 3-15）。design・materialだけを引き継ぎ、新しいprojectId・
// 新しい日時・末尾に「（コピー）」を付けたプロジェクト名を持つ、完全に独立した
// 新規プロジェクトを作る純粋関数（この時点ではまだ保存しない。呼び出し側で
// saveFurnitureProjectを呼ぶ）。
// 【重要】buildChecklist・cutListCheckedは意図的に引き継がない（複製は常に未着手として
// 扱う）。notes（設計・制作メモ、Phase 3-22）も同様に意図的に引き継がない（複製は
// 「新しい制作計画」として扱うため）。designはstructuredCloneで複製し、元プロジェクトの
// shelves配列などと参照を共有しない（後から複製側を編集しても元プロジェクトに影響しない）
export const duplicateFurnitureProject = (project: SavedFurnitureProject): SavedFurnitureProject => {
  const now = new Date().toISOString();
  return {
    id: createNewFurnitureProjectId(),
    version: 1,
    projectName: `${project.projectName}（コピー）`,
    createdAt: now,
    updatedAt: now,
    design: structuredClone(project.design),
    material: project.material,
  };
};
