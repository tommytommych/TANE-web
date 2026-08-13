// TANE:i Studio（FreeCAD+POV-Rayによる木工設計スタジオ、freecad-studio/）と
// チャットとの双方向同期に使う、確定仕様（品名・寸法・材質・パーツごとの塗装）の型定義

import type { SheetLayout } from './sheetLayout';
import type { FurnitureDesign } from './cad/types';

export type PanelFinish = 'clear' | 'walnut' | 'white' | 'black';

export interface StudioSpec {
  item: string;
  /** 家具の構造の種類。省略時は既存仕様どおり箱型（'box'）として扱う（後方互換） */
  kind?: 'box' | 'table';
  width: number;
  depth: number;
  height: number;
  thickness?: number;
  material: string;
  panelFinishes?: Partial<Record<'天板' | '底板' | '側板' | '背板', PanelFinish>>;
}

const PANEL_LABELS = ['天板', '底板', '側板', '背板'];
const PANEL_FINISHES: PanelFinish[] = ['clear', 'walnut', 'white', 'black'];

const isValidPanelFinishes = (value: unknown): value is StudioSpec['panelFinishes'] => {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([label, finish]) => PANEL_LABELS.includes(label) && PANEL_FINISHES.includes(finish as PanelFinish)
  );
};

export const isValidStudioSpec = (value: unknown): value is StudioSpec => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.item === 'string' &&
    (v.kind === undefined || v.kind === 'box' || v.kind === 'table') &&
    typeof v.width === 'number' &&
    typeof v.depth === 'number' &&
    typeof v.height === 'number' &&
    (v.thickness === undefined || typeof v.thickness === 'number') &&
    typeof v.material === 'string' &&
    isValidPanelFinishes(v.panelFinishes)
  );
};

// 国内のホームセンターで一般的な合板・集成材の規格サイズ（3×6版、910×1820mm）を
// 標準の元板として想定する
const DEFAULT_SHEET_WIDTH_MM = 910;
const DEFAULT_SHEET_HEIGHT_MM = 1820;
const DEFAULT_THICKNESS_MM = 18;

// 設計スタジオの確定仕様（天板・底板・側板・背板からなる箱型家具の外寸）から、
// カット申込書PDF（buildUniversalCutSheetPdf）が受け取れる2次元木取り図データを組み立てる。
// 天板・底板は外寸そのまま、側板は天板・底板の間、背板はさらに側板の内側に収まる前提の
// 簡易的な箱組み構成で近似しており、実際の組み方によって多少の誤差は出ることを想定している
// （PDF側にも「実際の誤差は店舗の機械により異なります」旨の注記が入っている）
export const studioSpecToSheetLayout = (spec: StudioSpec): SheetLayout => {
  const t = spec.thickness ?? DEFAULT_THICKNESS_MM;
  const clamp = (n: number) => Math.max(20, Math.round(n));

  return {
    name: `${spec.material}（${t}mm厚）`,
    sheetWidthMm: DEFAULT_SHEET_WIDTH_MM,
    sheetHeightMm: DEFAULT_SHEET_HEIGHT_MM,
    parts: [
      { widthMm: clamp(spec.width), heightMm: clamp(spec.depth), qty: 1, label: '天板' },
      { widthMm: clamp(spec.width), heightMm: clamp(spec.depth), qty: 1, label: '底板' },
      { widthMm: clamp(spec.depth), heightMm: clamp(spec.height - 2 * t), qty: 2, label: '側板' },
      { widthMm: clamp(spec.width - 2 * t), heightMm: clamp(spec.height - 2 * t), qty: 1, label: '背板' },
    ],
  };
};

// StudioSpecの寸法が、ブラウザCADの初期設計として安全に使える正の数値かどうかを確認する
// （Phase 4-08監査で発見：isValidStudioSpec()は型（number/string）だけを見ており符号までは
// 検証していないため、AIの出力や壊れたsessionStorageの値にwidth/depth/height/thicknessが
// 0以下・NaN・heightが板厚の2倍以下といった値が含まれていると、既存のパネル生成
// （app/lib/cad/geometry.tsのbuildDefaultFurniturePanels、変更していない）が例外を投げ、
// 通常のフォーム入力では既存のtry/catchで守られている一方、CadStudio.tsxのuseState初期値
// （lastValidModel、変更禁止のため触れない）は保護されておらずページ全体がクラッシュして
// いた。studioSpecToFurnitureDesign()へ渡す前に、この関数で安全性を確認する
export const isSafeStudioSpecDimensions = (spec: StudioSpec): boolean => {
  const isPositiveFinite = (n: number) => Number.isFinite(n) && n > 0;
  const thickness = spec.thickness ?? DEFAULT_THICKNESS_MM;
  return (
    isPositiveFinite(spec.width) &&
    isPositiveFinite(spec.depth) &&
    isPositiveFinite(spec.height) &&
    isPositiveFinite(thickness) &&
    spec.height > thickness * 2
  );
};

// AIチャット（「🌿 ブラウザCADで設計する」、CompletionCards.tsx）からTANE:iブラウザCAD
// （/app/cad、CadPageShell.tsx）へ、確定仕様を一時的に受け渡すためのsessionStorageキー
// （Phase 4-07）。localStorage・IndexedDB・URL query parameterはいずれも使わず、
// タブを閉じるまでだけ保持される一時領域に留める。読み取り側（CadPageShell.tsx）が
// 読み込み後すぐに削除するため、実質「1回限りの受け渡し」専用のキーとして扱う
export const CAD_INITIAL_DESIGN_SESSION_KEY = 'tanei-cad-initial-design-v1';

// StudioSpec（AIが提案した箱型家具の確定仕様）から、既存のFurnitureDesign
// （ブラウザCADの唯一の編集状態、CadStudio.tsxのuseState<FurnitureDesign>初期値）へ
// 変換する（Phase 4-07）。既存のstudioSpecToSheetLayout()と同じ「読み取り専用の変換」
// という考え方を踏襲し、StudioSpec・FurnitureDesignどちらの型定義も変更しない。
// backPanel・legs・shelvesはStudioSpec側に存在しない値のため、systemPrompt.tsが
// 前提としている「天板・底板・側板・背板からなる棚なし箱型」という既存ルールに忠実な
// 既定値（背板あり・脚なし・棚なし）で補うだけで、新しい推測ロジックは追加しない
export const studioSpecToFurnitureDesign = (spec: StudioSpec): FurnitureDesign => {
  if (spec.kind === 'table') {
    // テーブル（天板+脚+幕板）の場合、backPanel/legs/shelvesは型互換のためのプレースホルダー
    // 値で、geometry.tsのbuildDefaultTablePanelsはこれらを一切参照しない
    return {
      kind: 'table',
      width: spec.width,
      depth: spec.depth,
      height: spec.height,
      thickness: spec.thickness ?? DEFAULT_THICKNESS_MM,
      backPanel: false,
      legs: true,
      shelves: [],
    };
  }
  return {
    width: spec.width,
    depth: spec.depth,
    height: spec.height,
    thickness: spec.thickness ?? DEFAULT_THICKNESS_MM,
    backPanel: true,
    legs: false,
    shelves: [],
  };
};

// ブラウザCAD（CadStudio.tsx）から「完成イメージを見る」で設計スタジオへ送るための、
// studioSpecToFurnitureDesign()とは逆方向の変換。設計スタジオ側のレンダリング処理
// （tanei-studio/freecad_scripts/generate_model.pyのcompute_panels）は常に
// 天板・底板・側板・背板の箱型パネルを生成する実装で、kind:'table'
// （天板+脚+幕板、箱体なし）という概念が存在しない。そのためkind:'table'の設計を
// 渡すとCADでの見た目と矛盾した「閉じた箱」が生成されてしまうため、その場合はnullを
// 返し、呼び出し側（CadStudio.tsx）で「完成イメージを見る」を無効化する判断材料にする
export const furnitureDesignToStudioSpec = (
  design: FurnitureDesign,
  opts: { item: string; material: string }
): StudioSpec | null => {
  if (design.kind === 'table') return null;
  return {
    item: opts.item,
    width: design.width,
    depth: design.depth,
    height: design.height,
    thickness: design.thickness,
    material: opts.material,
  };
};
