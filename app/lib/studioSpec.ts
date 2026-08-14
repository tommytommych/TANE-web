// TANE:i Studio（FreeCAD+POV-Rayによる木工設計スタジオ、freecad-studio/）と
// チャットとの双方向同期に使う、確定仕様（品名・寸法・材質・パーツごとの塗装）の型定義

import type { SheetLayout } from './sheetLayout';
import type { FurnitureDesign } from './cad/types';
import {
  PART_MATERIAL_LABELS,
  type CutListItem,
  type PartMaterialLabel,
  buildFurnitureModel,
  furnitureModelToDimensionalLumberItems,
  furnitureModelToSheetLayoutsByMaterial,
} from './cad/model';

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
  /** 「天板はパイン集成材、脚・幕板はSPF材」のような、パーツ単位の材料指定（任意）。
   * 省略時は今まで通りmaterialが全パーツに使われる。値はmaterialと同じ語彙
   * （FURNITURE_MATERIALS）を想定しているが、ここでは型（string）までしか検証しない
   * （実在する材料名かどうかは、消費側＝CadPageShell.tsxが既存のsafeMaterialと同じ
   * 考え方でチェックする） */
  partMaterials?: Partial<Record<PartMaterialLabel, string>>;
  /** tanei-studio（完成イメージ）側の追加パーツ（扉・脚・棚板など）指定のうち、ブラウザCADの
   * 「棚板」を完成イメージにも反映するためだけに使う最小限のフィールド。tanei-studioの
   * 棚板（横棚板/shelf_h）はブラウザCADのような自由な高さ指定ではなく、本体内を指定した枚数で
   * 均等割りする方式のため、正確な位置までは再現できず「枚数」だけを引き継ぐ（無いよりは
   * 近い見た目になる、という割り切り）。扉・脚・キャスターなど他の追加パーツはブラウザCAD側に
   * 対応する概念が無いため、ここでは扱わない */
  options?: { shelf_h?: { tier1?: number } };
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

const isValidPartMaterials = (value: unknown): value is StudioSpec['partMaterials'] => {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([label, material]) => PART_MATERIAL_LABELS.includes(label as PartMaterialLabel) && typeof material === 'string'
  );
};

const isValidStudioSpecOptions = (value: unknown): value is StudioSpec['options'] => {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const shelfH = (value as Record<string, unknown>).shelf_h;
  if (shelfH === undefined) return true;
  if (typeof shelfH !== 'object' || shelfH === null) return false;
  const tier1 = (shelfH as Record<string, unknown>).tier1;
  return tier1 === undefined || typeof tier1 === 'number';
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
    isValidPanelFinishes(v.panelFinishes) &&
    isValidPartMaterials(v.partMaterials) &&
    isValidStudioSpecOptions(v.options)
  );
};

const DEFAULT_THICKNESS_MM = 18;

// 設計スタジオの確定仕様から、カット申込書PDF（buildUniversalCutSheetPdf）が受け取れる
// 2次元木取り図データ（材料ごとに1件）を組み立てる。以前はここに専用の箱型4パーツ計算
// （天板・底板・側板・背板）を直接持っていたが、spec.kindを見ていなかったためテーブル
// （天板+脚+幕板）でも常に箱型パーツを生成してしまう不具合があった。新しい計算式を
// 増やすのではなく、既存のstudioSpecToFurnitureDesign（寸法→FurnitureDesign）→
// buildFurnitureModel（→パーツごとの材料反映）→furnitureModelToSheetLayoutsByMaterial
// （材料ごとの木取り図）という、ブラウザCAD側と全く同じ既存パイプラインに委譲する。
// これにより、box/tableどちらでも実際の構造どおりのパーツが生成され、材料ごとに
// 正しく分離されたセクションになる（ブラウザCADの木取り図と計算方法が完全に一致する）
export const studioSpecToSheetLayout = (spec: StudioSpec): SheetLayout[] => {
  const design = studioSpecToFurnitureDesign(spec);
  const model = buildFurnitureModel(design, {
    projectId: 'studio-cutsheet',
    name: spec.item,
    material: spec.material,
    partMaterials: spec.partMaterials,
  });
  return furnitureModelToSheetLayoutsByMaterial(model);
};

// studioSpecToSheetLayout()と同じ委譲パイプラインで、SPF材（2×4）等の規格材
// （板取り図の対象外、furnitureModelToSheetLayoutsByMaterialでは除外される材料）の
// パーツ一覧だけを取り出す。完成イメージの「カット依頼用紙へ」PDFで、板取り図が無い
// 材料の部材も欠落しないようにするために使う
export const studioSpecToDimensionalLumberItems = (spec: StudioSpec): CutListItem[] => {
  const design = studioSpecToFurnitureDesign(spec);
  const model = buildFurnitureModel(design, {
    projectId: 'studio-cutsheet',
    name: spec.item,
    material: spec.material,
    partMaterials: spec.partMaterials,
  });
  return furnitureModelToDimensionalLumberItems(model);
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
// studioSpecToFurnitureDesign()とは逆方向の変換。tanei-studio側は現在box・table
// どちらのkindにも対応済み（generate_model.pyのcompute_panels_for_kind）のため、
// 戻り値はnullを返さず常にStudioSpecを返す（呼び出し側の型はnull許容のまま維持し、
// 将来また非対応のkindが増えた場合に安全に拡張できるようにしている）
export const furnitureDesignToStudioSpec = (
  design: FurnitureDesign,
  opts: { item: string; material: string; partMaterials?: Partial<Record<PartMaterialLabel, string>> }
): StudioSpec | null => ({
  item: opts.item,
  kind: design.kind === 'table' ? 'table' : 'box',
  width: design.width,
  depth: design.depth,
  height: design.height,
  thickness: design.thickness,
  material: opts.material,
  ...(opts.partMaterials && Object.keys(opts.partMaterials).length > 0
    ? { partMaterials: opts.partMaterials }
    : {}),
  // 棚板の枚数だけを引き継ぐ（テーブルには棚板が無いためbox限定）。0件も明示的に送ることで、
  // ブラウザCAD側で棚板を全て削除した場合も完成イメージ側に正しく反映される
  ...(design.kind !== 'table' ? { options: { shelf_h: { tier1: design.shelves.length } } } : {}),
});
