// AIチャットが提案した家具の確定仕様（品名・寸法・材質・パーツごとの塗装）の型定義と、
// TANE:iブラウザCAD（FurnitureDesign）への変換。もともとはFreeCAD+POV-Ray版の旧設計
// スタジオとの双方向同期にも使われていたが、Phase Eで旧スタジオを廃止したため、現在は
// AIチャット→ブラウザCAD（studioSpecToFurnitureDesign）の一方向の変換専用になっている

import type { FurnitureDesign } from './cad/types';
import { PART_MATERIAL_LABELS, type PartMaterialLabel, setEvenlySpacedShelves, MAX_DRAWER_COUNT } from './cad/model';
import { MIN_LEG_HEIGHT_MM, MAX_LEG_HEIGHT_MM } from './cad/geometry';

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
  /** kind:"box"の場合のみ有効な追加パーツ指定（任意）。ブラウザCADの手動編集で既に
   * できること（脚のON/OFF・本数・高さ、扉のON/OFF・枚数、引き出しの枚数）を、
   * AI提案の時点でも指定できるようにする。省略時は従来通り「脚なし・扉なし・引き出しなし」 */
  options?: {
    shelf_h?: { tier1?: number };
    legs?: boolean;
    legHeightMm?: number;
    legCount?: 4 | 6;
    doors?: boolean;
    doorCount?: 1 | 2;
    drawerCount?: number;
  };
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
  const v = value as Record<string, unknown>;

  const shelfH = v.shelf_h;
  if (shelfH !== undefined) {
    if (typeof shelfH !== 'object' || shelfH === null) return false;
    const tier1 = (shelfH as Record<string, unknown>).tier1;
    if (tier1 !== undefined && typeof tier1 !== 'number') return false;
  }

  return (
    (v.legs === undefined || typeof v.legs === 'boolean') &&
    (v.legHeightMm === undefined || typeof v.legHeightMm === 'number') &&
    (v.legCount === undefined || v.legCount === 4 || v.legCount === 6) &&
    (v.doors === undefined || typeof v.doors === 'boolean') &&
    (v.doorCount === undefined || v.doorCount === 1 || v.doorCount === 2) &&
    (v.drawerCount === undefined || typeof v.drawerCount === 'number')
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
    isValidPanelFinishes(v.panelFinishes) &&
    isValidPartMaterials(v.partMaterials) &&
    isValidStudioSpecOptions(v.options)
  );
};

const DEFAULT_THICKNESS_MM = 18;

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

// AIチャットが棚板の枚数を指定してくる場合に許容する上限（安全側のガード）。
// 完成イメージ側（tanei-studio）の横棚板は最大4枚までという制約があり、systemPrompt.tsでも
// AIに4枚までに収めるよう指示しているが、AIの出力は指示を守るとは限らないため、
// 万一大きすぎる数値が来ても大量の棚板生成で固まらないよう、ここでも上限を設ける
const MAX_AI_SHELF_COUNT = 20;

// StudioSpec（AIが提案した箱型家具の確定仕様）から、既存のFurnitureDesign
// （ブラウザCADの唯一の編集状態、CadStudio.tsxのuseState<FurnitureDesign>初期値）へ
// 変換する（Phase 4-07）。「読み取り専用の変換」という考え方を踏襲し、StudioSpec・
// FurnitureDesignどちらの型定義も変更しない。
// backPanel・legsはStudioSpec側に存在しない値のため、systemPrompt.tsが前提としている
// 「天板・底板・側板・背板からなる棚なし箱型」という既存ルールに忠実な既定値
// （背板あり・脚なし）で補うだけで、新しい推測ロジックは追加しない。
// shelvesだけは例外で、spec.options.shelf_h.tier1にAIが棚板の枚数を指定していれば反映する
// （以前はここが常にshelves:[]に固定されており、AIが「5段」のような棚板付きの提案をしても
// ブラウザCADを開くと棚板が消えてしまう不具合があった）
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

  let design: FurnitureDesign = {
    width: spec.width,
    depth: spec.depth,
    height: spec.height,
    thickness: spec.thickness ?? DEFAULT_THICKNESS_MM,
    backPanel: true,
    legs: false,
    shelves: [],
  };

  const shelfCount = spec.options?.shelf_h?.tier1;
  if (typeof shelfCount === 'number' && Number.isFinite(shelfCount) && shelfCount > 0) {
    const count = Math.min(MAX_AI_SHELF_COUNT, Math.round(shelfCount));
    // setEvenlySpacedShelves()でN枚を内寸の高さいっぱいに均等配置する。addShelfToDesign()を
    // N回繰り返す方式も試したが、「1枚ずつ、その時点で最も広い隙間へ追加する」という
    // 手動編集向けの挙動のため、まとめてN枚指定する場合は底側に固まる等バランスの悪い
    // 配置になってしまっていた（実機確認で判明）。AIが「5段」のようにまとめて指定してくる
    // 場合は、常に均等な配置になるこちらを使う
    design = setEvenlySpacedShelves(design, count);
  }

  // 脚・扉・引き出しは、ブラウザCADの手動編集（CadStudio.tsx）で既にできることを
  // AI提案の時点でも反映できるようにする（Phase：チャット提案のバリエーション拡充）。
  // 値の妥当性チェック（isValidStudioSpec）は型（number/boolean）までしか見ていないため、
  // ここでもshelfCountと同じ考え方で、CAD本体と同じ許容範囲へクランプしてから反映する
  // （範囲外の値をそのまま渡すとgeometry.tsのパネル生成が壊れた見た目になり得るため）
  if (spec.options?.legs) {
    design = {
      ...design,
      legs: true,
      legHeightMm:
        typeof spec.options.legHeightMm === 'number' && Number.isFinite(spec.options.legHeightMm)
          ? Math.min(MAX_LEG_HEIGHT_MM, Math.max(MIN_LEG_HEIGHT_MM, Math.round(spec.options.legHeightMm)))
          : undefined,
      legCount: spec.options.legCount === 6 ? 6 : 4,
    };
  }

  if (spec.options?.doors) {
    design = { ...design, doors: true, doorCount: spec.options.doorCount === 2 ? 2 : 1 };
  }

  const drawerCount = spec.options?.drawerCount;
  if (typeof drawerCount === 'number' && Number.isFinite(drawerCount) && drawerCount > 0) {
    design = { ...design, drawerCount: Math.min(MAX_DRAWER_COUNT, Math.round(drawerCount)) };
  }

  return design;
};
