// FurnitureModel/FurnitureDesignの作成・更新・既存データ形式（木取り図・3Dビューア）への
// 変換ヘルパー。
//
// 【重要】ここが「3D表示用データ・木取り図用データ・設計図用データがバラバラにならない」
// という方針の要になる。木取り図は新しい計算ロジックを作らず、既存のapp/lib/sheetLayout.ts
// （実績のある2次元ビンパッキング）へそのまま渡せる形に変換するだけにしている。
//
// 【状態管理の方針】ユーザーの操作（寸法変更・棚板の追加/削除/編集・背板や脚の切り替え）は
// 全て「FurnitureDesignを新しいFurnitureDesignへ変換する関数」として実装する
// （resizeFurnitureDesign・addShelfToDesign等）。3Dオブジェクトそのものを直接いじる操作は
// 存在しない。CadStudio.tsxはこれらの関数を呼んでReactのstateを更新するだけで、
// panels（延いては3D表示）は毎回buildFurnitureModel()で再計算される。

import type { SheetLayout, SheetPart } from '../sheetLayout';
import type { FurnitureDesign, FurnitureModel, FurniturePanel, FurniturePanelKind, PanelFinish, ShelfEntry } from './types';
import {
  buildFurniturePanels,
  clampShelfEntry,
  defaultShelfSize,
  MAX_LEG_HEIGHT_MM,
  MIN_LEG_HEIGHT_MM,
  panelToCutSizeMm,
} from './geometry';
import { DEMO_ASSEMBLY_MANUAL } from '../assemblyManual';
import { KOHNAN_WOOD_LIST } from '../constants';

// systemPrompt.ts（tanei-studio-specブロック）・tanei-studio/freecad_scripts/generate_model.pyと
// 語彙を揃えている（AIの提案・FreeCAD版・ブラウザCADのどれでも同じ材質名で扱えるようにするため）
// 'SPF材（1×4）'・'SPF材（2×4）'は、app/lib/constants.tsのKOHNAN_WOOD_LISTに既に存在する
// 同名エントリ（価格目安データ）とまったく同じ表記にしている。区別なしの'SPF材'は削除せず、
// 既存の保存データ・AIが具体的な規格を明言しなかった場合のフォールバックとして残す
// （従来通り2×4相当として扱われる。geometry.ts参照）
export const FURNITURE_MATERIALS = [
  'パイン集成材',
  'シナベニヤ',
  'ラワン合板',
  'SPF材',
  'SPF材（1×4）',
  'SPF材（2×4）',
  'OSB合板',
] as const;
export type FurnitureMaterial = (typeof FURNITURE_MATERIALS)[number];

/** 木取り図の表示方法を左右する、材料の購入単位の区別。
 * 'sheet'：サブロク板等の板から切り出す板材（天板・底板・側板・背板・棚板に使う一般的な材料）。
 * 'dimensionalLumber'：2×4材等、板ではなく決まった断面の規格材・角材として購入する材料
 * （KOHNAN_WOOD_LISTのSPF材の価格データも910/1820/2440mmの「長さ」表記であり、
 * 910×1820mmの「板」としては売られていない）。判定はパーツ種類ではなく材料名そのもので
 * 行う（同じ材料が箱型の天板等に使われた場合も同様に規格材として扱う） */
export type FurnitureMaterialType = 'sheet' | 'dimensionalLumber';

const DIMENSIONAL_LUMBER_MATERIALS: readonly string[] = ['SPF材', 'SPF材（1×4）', 'SPF材（2×4）'];

export function getFurnitureMaterialType(material: string): FurnitureMaterialType {
  return DIMENSIONAL_LUMBER_MATERIALS.includes(material) ? 'dimensionalLumber' : 'sheet';
}

const DEFAULT_THICKNESS_MM = 18;

/** 新規のFurnitureModelを、寸法だけ指定して作成する（panelsは自動計算、棚板等は無し）。
 * チャット側のtanei-studio-specブロックから箱型家具の外形だけを反映したい場合などに使う */
export function createFurnitureModel(input: {
  projectId: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  material?: string;
  thickness?: number;
}): FurnitureModel {
  const thickness = input.thickness ?? DEFAULT_THICKNESS_MM;
  const material = input.material ?? FURNITURE_MATERIALS[0];
  const design: FurnitureDesign = {
    width: input.width,
    depth: input.depth,
    height: input.height,
    thickness,
    backPanel: true,
    legs: false,
    shelves: [],
  };

  return {
    kind: 'furniture',
    projectId: input.projectId,
    name: input.name,
    width: input.width,
    depth: input.depth,
    height: input.height,
    material,
    thickness,
    panels: buildFurniturePanels(design),
    options: {},
  };
}

// 寸法入力欄で許容する範囲（tanei-studio/server.pyのMIN/MAX_DIMENSION_MMと揃えている）
export const MIN_DIMENSION_MM = 100;
export const MAX_DIMENSION_MM = 3000;
export const MIN_THICKNESS_MM = 10;
export const MAX_THICKNESS_MM = 40;

/** ブラウザCADの最初の実装対象「シンプルな木製棚」の初期状態。
 * 幅750×奥行300×高さ900mm、板厚18mm、背板あり、脚なし、棚板2枚が既定値 */
export function createDefaultFurnitureDesign(): FurnitureDesign {
  const base: Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness' | 'backPanel'> = {
    width: 750,
    depth: 300,
    height: 900,
    thickness: 18,
    backPanel: true,
  };

  let design: FurnitureDesign = { ...base, legs: false, shelves: [] };
  // 初期状態も「棚板を追加」と同じ関数で組み立てることで、追加ロジックの一貫性を保つ
  design = addShelfToDesign(design);
  design = addShelfToDesign(design);
  return design;
}

/** テーブル（天板+脚+幕板）の初期状態。幅1200×奥行700×高さ700mm、板厚25mmが既定値。
 * backPanel/legs/shelvesは既存のFurnitureDesign型との互換のため残すだけの未使用値
 * （テーブルの脚・幕板の有無はkind:'table'自体が表しており、geometry.tsの
 * buildDefaultTablePanelsはこれらのフィールドを一切参照しない） */
export function createDefaultTableDesign(): FurnitureDesign {
  return {
    kind: 'table',
    width: 1200,
    depth: 700,
    height: 700,
    thickness: 25,
    backPanel: false,
    legs: true,
    shelves: [],
  };
}

/** 全ての棚板を、現在の家具寸法（側板・天板・底板・背板の内側）へ収まるよう再クランプする。
 * 家具全体の寸法変更・背板ON/OFFなど、棚板の許容範囲が変わりうる操作の後に必ず通す */
export function withClampedShelves(design: FurnitureDesign): FurnitureDesign {
  return { ...design, shelves: design.shelves.map((shelf) => clampShelfEntry(design, shelf)) };
}

/** 家具全体の寸法（幅・奥行・高さ・板厚のいずれか）を変更する。
 * 側板・天板・底板・背板・棚板が正しい位置関係を保つよう、既存の棚板を自動的にクランプする */
export function resizeFurnitureDesign(
  design: FurnitureDesign,
  patch: Partial<Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness'>>
): FurnitureDesign {
  return withClampedShelves({ ...design, ...patch });
}

export function setBackPanel(design: FurnitureDesign, backPanel: boolean): FurnitureDesign {
  return withClampedShelves({ ...design, backPanel });
}

export function setLegs(design: FurnitureDesign, legs: boolean): FurnitureDesign {
  return { ...design, legs };
}

export function setLegHeight(design: FurnitureDesign, heightMm: number): FurnitureDesign {
  const clamped = Math.min(MAX_LEG_HEIGHT_MM, Math.max(MIN_LEG_HEIGHT_MM, Math.round(heightMm)));
  return { ...design, legHeightMm: clamped };
}

export function setLegCount(design: FurnitureDesign, count: 4 | 6): FurnitureDesign {
  return { ...design, legCount: count };
}

export function setDoors(design: FurnitureDesign, doors: boolean): FurnitureDesign {
  return { ...design, doors };
}

export function setDoorCount(design: FurnitureDesign, count: 1 | 2): FurnitureDesign {
  return { ...design, doorCount: count };
}

// 「＋/－」操作で無制限に増減できてしまうと、板厚に対して前板が薄くなりすぎ
// （geometry.tsのbuildDrawerPanelsがMIN_SHELF_SIZE_MMで下限は守るが、隙間なく
// 重なって見えるほど不自然になる）ため、UI操作としての上限を設ける
export const MAX_DRAWER_COUNT = 8;

export function setDrawerCount(design: FurnitureDesign, count: number): FurnitureDesign {
  const clamped = Math.min(MAX_DRAWER_COUNT, Math.max(0, Math.round(count)));
  return { ...design, drawerCount: clamped };
}

let shelfIdCounter = 0;
function nextShelfId(): string {
  shelfIdCounter += 1;
  return `shelf-${Date.now()}-${shelfIdCounter}`;
}

/** 棚板を1枚追加する。「棚の内部に自動配置する」の実装: 既存の棚板・天板・底板の
 * 位置から最も広い隙間を見つけ、その中央に新しい棚板を置く（棚板がまだ無ければ中央に置く） */
export function addShelfToDesign(design: FurnitureDesign): FurnitureDesign {
  const t = design.thickness;
  const minZ = t;
  const maxZ = Math.max(minZ, design.height - t);
  const sortedZ = [minZ, ...design.shelves.map((s) => s.zAtMm), maxZ].sort((a, b) => a - b);

  // 「最も広い隙間」は、sortedZの隣り合う点同士の間隔（実在する隙間）だけを比較して
  // 決める。以前はここをmaxZ-minZ（本体全体の高さ）で初期化していたため、既に棚板が
  // 1枚以上ある状態では、どの実在の隙間もこの初期値（本体全体の高さ）を超えられず、
  // 2枚目以降の棚板が常に最初の棚板と同じ位置（本体中央）に重なって配置されてしまう
  // 不具合があった（パーツ一覧には棚板が追加されて見えるのに、3Dでは重なって
  // 1枚しか見えないという症状の原因）。最初の実在の隙間（sortedZ[0]〜sortedZ[1]）を
  // 初期値にし、残りの隙間とだけ比較する
  let gapStart = sortedZ[0];
  let gapSize = sortedZ[1] - sortedZ[0];
  for (let i = 1; i < sortedZ.length - 1; i++) {
    const size = sortedZ[i + 1] - sortedZ[i];
    if (size > gapSize) {
      gapSize = size;
      gapStart = sortedZ[i];
    }
  }

  const { widthMm, depthMm } = defaultShelfSize(design);
  const newShelf: ShelfEntry = {
    id: nextShelfId(),
    zAtMm: gapStart + gapSize / 2,
    widthMm,
    depthMm,
  };

  return { ...design, shelves: [...design.shelves, newShelf] };
}

export function removeShelfFromDesign(design: FurnitureDesign, shelfId: string): FurnitureDesign {
  return { ...design, shelves: design.shelves.filter((s) => s.id !== shelfId) };
}

/** 棚板をちょうどcount枚、内寸の高さを均等に区切る位置へまとめて配置し直す
 * （既存の棚板は置き換える）。addShelfToDesign()は「1枚ずつ、その時点で最も広い隙間へ
 * 追加する」という手動編集向けの挙動のため、複数枚をまとめて指定する場合
 * （AI提案の"5段"等）に順番に呼び出すと、隙間の埋まり方の偏りでバランスの悪い配置に
 * なってしまう（例: 底側に固まって配置される）。「N枚でN+1個の均等な段を作る」という、
 * tanei-studio側の横棚板（generate_model.pyの_option_shelf_h）と同じ考え方の計算式を
 * 使うことで、常に均等な配置にする */
export function setEvenlySpacedShelves(design: FurnitureDesign, count: number): FurnitureDesign {
  if (count <= 0) return { ...design, shelves: [] };
  const t = design.thickness;
  const minZ = t;
  const maxZ = Math.max(minZ, design.height - t);
  const { widthMm, depthMm } = defaultShelfSize(design);
  const shelves: ShelfEntry[] = Array.from({ length: count }, (_, i) => ({
    id: nextShelfId(),
    zAtMm: minZ + ((i + 1) * (maxZ - minZ)) / (count + 1),
    widthMm,
    depthMm,
  }));
  return { ...design, shelves };
}

/** 選択中の棚板1枚の高さ・幅・奥行きを更新する。側板・天板・底板・背板を突き抜けない
 * 範囲へ自動的にクランプする（自由変形は許可しない、という方針の実装箇所） */
export function updateShelfInDesign(
  design: FurnitureDesign,
  shelfId: string,
  patch: Partial<Pick<ShelfEntry, 'zAtMm' | 'widthMm' | 'depthMm'>>
): FurnitureDesign {
  return {
    ...design,
    shelves: design.shelves.map((shelf) =>
      shelf.id === shelfId ? clampShelfEntry(design, { ...shelf, ...patch }) : shelf
    ),
  };
}

/** FurnitureDesignから実際に表示・木取りに使うFurnitureModelを作る
 * （FurnitureDesign → Panel[] → 3D Renderingという流れの、Panel[]計算の入口） */
export function buildFurnitureModel(
  design: FurnitureDesign,
  overrides?: {
    projectId?: string;
    name?: string;
    material?: string;
    /** 「天板だけパイン集成材、脚・幕板はSPF材」のような、パーツ単位の材料指定（任意）。
     * 省略時・キーが無いパーツは、今まで通りmaterial（家具全体の材料）を使う */
    partMaterials?: Partial<Record<PartMaterialLabel, string>>;
    /** 「天板だけウォルナット調」のような、パーツ単位の色・仕上げ指定（任意）。
     * 省略時・キーが無いパーツは、材料そのものの色（クリア塗装）のまま扱う */
    partFinishes?: Partial<Record<PartMaterialLabel, PanelFinish>>;
  }
): FurnitureModel {
  const material = overrides?.material ?? FURNITURE_MATERIALS[0];
  const partMaterials = overrides?.partMaterials;
  const partFinishes = overrides?.partFinishes;

  // テーブルの脚・幕板は、材料としてSPF材が選ばれている場合のみ実寸2×4断面
  // （38×89mm、geometry.tsのresolveLegCrossSection/resolveApronCrossSection参照）になる。
  // 幾何計算（buildFurniturePanels）の時点で材料を知る必要があるため、パネル生成後に
  // 上書きする他のパーツとは別に、ここで先に解決して渡す
  const legMaterial = partMaterials?.['脚'] ?? material;
  const apronMaterial = partMaterials?.['幕板'] ?? material;

  // 既存のFurniturePanel.material・finish（元々あるが、これまで書き込み元が無かった
  // フィールド）へ、パーツ種類ごとの上書き材料・色を反映する。該当する上書きが無い
  // パネルはそのまま返す（新しい配列参照にはなるが、内容は既存のbuildFurniturePanels(design)
  // の結果と同一）
  const panels = buildFurniturePanels(design, { legMaterial, apronMaterial }).map((panel) => {
    const label = CUT_LIST_KIND_NAME[panel.kind] as PartMaterialLabel | undefined;
    const overrideMaterial = label ? partMaterials?.[label] : undefined;
    const overrideFinish = label ? partFinishes?.[label] : undefined;
    if (!overrideMaterial && !overrideFinish) return panel;
    return {
      ...panel,
      ...(overrideMaterial ? { material: overrideMaterial } : {}),
      ...(overrideFinish ? { finish: overrideFinish } : {}),
    };
  });

  return {
    kind: 'furniture',
    projectId: overrides?.projectId ?? 'shelf-demo',
    name: overrides?.name ?? 'シンプルな木製棚',
    width: design.width,
    depth: design.depth,
    height: design.height,
    material,
    thickness: design.thickness,
    panels,
    options: {
      backPanel: design.backPanel,
      legs: design.legs,
      legHeightMm: design.legHeightMm,
      legCount: design.legCount ?? 4,
      doors: design.doors ?? false,
      doorCount: design.doorCount ?? 1,
      drawerCount: design.drawerCount ?? 0,
      shelfCount: design.shelves.length,
    },
  };
}

export interface StandardBoardSize {
  label: string;
  widthMm: number;
  heightMm: number;
}

// ホームセンター（コーナン・カインズ・コメリ等）で共通して手に入る定尺サイズ。
// freecad-integration/src/boardSizes.tsのSTANDARD_BOARD_SIZESと同じ2種類（小さい順）を
// 採用している（値の重複はあるが、あちらはNode.js単体パッケージとして意図的に
// 依存関係を持たないため、ここでも同じ値をそのまま定義する）
// widthMmを横方向として描画する木取り図（cutSheetPdf.ts・SheetLayoutSvg.tsx）が縦長に
// ならないよう、長辺をwidthMmに割り当てる（横長・landscape）。pickBoardSizeForPanels側は
// 縦横どちらの向きでも収まるか判定しているため、この並び順を変えても判定結果（どの定尺を
// 選ぶか）自体には影響しない
export const STANDARD_BOARD_SIZES: StandardBoardSize[] = [
  { label: 'サブロク板 (910×1820mm)', widthMm: 1820, heightMm: 910 },
  { label: 'シハチ板 (1210×2430mm)', widthMm: 2430, heightMm: 1210 },
];

/** 全パネルの中で最大の辺が収まる、最小の定尺サイズを選ぶ（回転して収まる向きも考慮）。
 * どの定尺にも収まらないパネルがあればnullを返す */
function pickBoardSizeForPanels(panels: FurniturePanel[]): StandardBoardSize | null {
  let maxWidthMm = 0;
  let maxHeightMm = 0;
  for (const panel of panels) {
    const { widthMm, heightMm } = panelToCutSizeMm(panel);
    maxWidthMm = Math.max(maxWidthMm, widthMm);
    maxHeightMm = Math.max(maxHeightMm, heightMm);
  }

  const fitting = STANDARD_BOARD_SIZES.filter((board) => {
    const fitsAsIs = maxWidthMm <= board.widthMm && maxHeightMm <= board.heightMm;
    const fitsRotated = maxHeightMm <= board.widthMm && maxWidthMm <= board.heightMm;
    return fitsAsIs || fitsRotated;
  });

  if (fitting.length === 0) return null;
  return fitting.reduce((smallest, board) =>
    board.widthMm * board.heightMm < smallest.widthMm * smallest.heightMm ? board : smallest
  );
}

/** FurnitureModelのpanelsを、既存の木取り図PDF/SVG（app/lib/sheetLayout.ts,
 * app/lib/cutSheetPdf.ts）がそのまま受け取れるSheetLayoutへ変換する。
 * 新しいビンパッキングロジックは実装しない（既存ロジックの再利用）。パネルの中に
 * どの定尺サイズにも収まらないもの（家具の幅・奥行が非常に大きい場合など）があれば、
 * 計算不能を示すnullを返す（呼び出し側で初心者向けのエラー文を出す） */
export function furnitureModelToSheetLayout(model: FurnitureModel): SheetLayout | null {
  if (model.panels.length === 0) return null;

  const boardSize = pickBoardSizeForPanels(model.panels);
  if (!boardSize) return null;

  const parts: SheetPart[] = model.panels.map((panel) => {
    const { widthMm, heightMm } = panelToCutSizeMm(panel);
    return { widthMm, heightMm, qty: 1, label: panel.label };
  });

  return {
    name: `${model.material}（${model.thickness}mm厚）・${boardSize.label}`,
    sheetWidthMm: boardSize.widthMm,
    sheetHeightMm: boardSize.heightMm,
    parts,
  };
}

/** furnitureModelToSheetLayout()の材料別バージョン。パネルごとの材料（panel.material、
 * 無ければmodel.material）でグルーピングし、材料ごとに独立した木取り図（SheetLayout）を
 * 作る。「天板はパイン集成材、脚・幕板はSPF材」のような設計で、材料ごとに正しく分離された
 * 木取り図・カットリスト・PDFを表示するために使う（既存のfurnitureModelToSheetLayoutは
 * 単一のSheetLayoutしか返さず、Phase3（CadBuildChecklistView.tsx）が今も依存しているため
 * 変更していない。こちらは新規追加の別関数）。
 * getFurnitureMaterialTypeが'dimensionalLumber'と判定する材料（SPF材等）は、板から
 * 切り出す対象ではないため、そもそもグループを作らずサブロク板の木取り図を生成しない
 * （代わりにfurnitureModelToDimensionalLumberItems()で部材一覧として扱う）。
 * どの定尺サイズにも収まらない材料グループは、そのグループだけを結果から除外する
 * （他の材料グループの木取りまで丸ごと計算不能にはしない） */
export function furnitureModelToSheetLayoutsByMaterial(model: FurnitureModel): SheetLayout[] {
  if (model.panels.length === 0) return [];

  const groups = new Map<string, FurniturePanel[]>();
  model.panels.forEach((panel) => {
    const material = panel.material ?? model.material;
    if (getFurnitureMaterialType(material) === 'dimensionalLumber') return;
    const list = groups.get(material);
    if (list) {
      list.push(panel);
    } else {
      groups.set(material, [panel]);
    }
  });

  const layouts: SheetLayout[] = [];
  groups.forEach((panels, material) => {
    const boardSize = pickBoardSizeForPanels(panels);
    if (!boardSize) return;

    const parts: SheetPart[] = panels.map((panel) => {
      const { widthMm, heightMm } = panelToCutSizeMm(panel);
      return { widthMm, heightMm, qty: 1, label: panel.label };
    });

    layouts.push({
      name: `${material}（${model.thickness}mm厚）・${boardSize.label}`,
      sheetWidthMm: boardSize.widthMm,
      sheetHeightMm: boardSize.heightMm,
      parts,
    });
  });

  return layouts;
}

/** Three.js/React Three Fiber（Phase 2以降）でそのまま描画できる形式。
 * tanei-studio/server.pyのserialize_panels_for_viewer()と同じ形（label/x/y/z/dx/dy/dz/color）
 * にidを加えたもの。同じ役割のパネルが複数枚（棚板2枚など）あるとlabelが重複するため、
 * Reactのkeyにはpanel.idではなくlabelを使わないよう、idを別途持たせている */
export interface ViewerPanel {
  id: string;
  /** パネルの種類（'door'/'drawer'等）。CadViewport.tsx側が取っ手の見た目を出し分ける
   * 判定にのみ使う、表示専用の情報（木取り図・カットリストの計算には影響しない） */
  kind: FurniturePanelKind;
  label: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  color: string;
  /** true: ホワイト/ブラックの塗装仕上げ（不透明な塗料で木目が隠れる）。
   * false: クリア塗装・ウォルナット調・無指定（木地や着色ステインで木目が見える）。
   * Phase D「木材表現」でCadViewport.tsx側が木目テクスチャを出すかどうかの判定に使う */
  isPainted: boolean;
}

const MATERIAL_COLOR_HEX: Record<string, string> = {
  パイン集成材: '#E8C9A0',
  シナベニヤ: '#E4D5B7',
  ラワン合板: '#C99A6C',
  SPF材: '#D9C29A',
  'SPF材（1×4）': '#D9C29A',
  'SPF材（2×4）': '#D9C29A',
  OSB合板: '#B8926A',
};
const DEFAULT_COLOR_HEX = '#D9C29A';
const LEG_COLOR_HEX = '#6B5B4A';

const FINISH_COLOR_HEX: Record<string, string> = {
  clear: DEFAULT_COLOR_HEX,
  walnut: '#5C3A21',
  // 3D表示のシェーディング（陰影）で暗く見える分を見込み、実際の塗料の白より
  // 明るめのほぼ純白にしている（CadViewport.tsxのライティング下で「しっかり白」に見えるよう調整）
  white: '#FAFAFA',
  black: '#2B2B2B',
};

function colorForPanel(panel: FurniturePanel, modelMaterial: string): string {
  if (panel.finish && panel.finish in FINISH_COLOR_HEX) return FINISH_COLOR_HEX[panel.finish];
  if (panel.kind === 'leg') return LEG_COLOR_HEX;
  const material = panel.material ?? modelMaterial;
  return MATERIAL_COLOR_HEX[material] ?? DEFAULT_COLOR_HEX;
}

export function furnitureModelToViewerPanels(model: FurnitureModel): ViewerPanel[] {
  return model.panels.map((panel) => ({
    id: panel.id,
    kind: panel.kind,
    label: panel.label,
    x: panel.position.x,
    y: panel.position.y,
    z: panel.position.z,
    dx: panel.size.x,
    dy: panel.size.y,
    dz: panel.size.z,
    color: colorForPanel(panel, model.material),
    isPainted: panel.finish === 'white' || panel.finish === 'black',
  }));
}

/** 「制作する」画面（Phase 2-4の木取り図から続く制作情報）で使う、初心者向け作業手順。
 * AIによる自由生成は行わず、現在のPanel[]から機械的に判断できる範囲（背板・棚板・脚の
 * 有無、パネルの実際の位置・寸法）だけを文面に反映する、決まった手順のテンプレートを
 * 組み立てる */
export interface FurnitureBuildStep {
  stepNumber: number;
  title: string;
  description: string;
}

// 板厚に対するビスの長さ・下穴の目安。「板を貫通させず、かつしっかり効かせる」という
// 一般的な木工DIYの目安（板厚の1.5〜2倍程度）をそのまま数式にしただけで、パーツごとの
// 強度計算等は行わない。5mm単位に丸めるのは「27mm」のような中途半端な値を避けるため
const roundToNearest5 = (mm: number): number => Math.round(mm / 5) * 5;

export function buildFurnitureSteps(panels: FurniturePanel[], thicknessMm: number): FurnitureBuildStep[] {
  // 'apron'（幕板）はテーブル（天板+脚+幕板）専用のパネル種類のため、これが含まれて
  // いれば箱型ではなくテーブルの手順文言を組み立てる。新しいSTEPタイトル・新しい
  // ステップ数は作らず、既存の9つのタイトル（材料を準備する〜仕上げを行う）はそのまま
  // 使い、各ステップの文言だけをPanel[]の実際の位置・寸法から具体的に組み立てる
  const isTable = panels.some((p) => p.kind === 'apron');
  const hasBackPanel = panels.some((p) => p.kind === 'back');
  const legPanels = panels.filter((p) => p.kind === 'leg');
  const hasLegs = legPanels.length > 0;
  const shelves = panels.filter((p) => p.kind === 'shelf').sort((a, b) => a.position.z - b.position.z);
  const shelfCount = shelves.length;

  const cutTargets = isTable
    ? '天板・脚・幕板'
    : ['天板・底板・側板', hasBackPanel && '背板', shelfCount > 0 && '棚板']
        .filter((v): v is string => Boolean(v))
        .join('・');

  const assembleTargets = isTable
    ? '脚に幕板を固定して脚組みを作り、天板を取り付け'
    : [
        '側板に底板・天板を固定',
        shelfCount > 0 && '棚板を取り付け',
        hasBackPanel && '背板を取り付け',
        hasLegs && '脚を取り付け',
      ]
        .filter((v): v is string => Boolean(v))
        .join('、');

  // 「組み立て位置を確認する」の具体化。legPanels[0].position.x／.yは、geometry.tsの
  // TABLE_LEG_INSET_MM（テーブル）・板厚t（箱型の飾り脚）がそのまま入っているため、
  // 定数を別途importせず、実際に計算されたパネル位置から直接読み取る
  let positionDescription: string;
  if (isTable) {
    const insetMm = legPanels[0] ? Math.round(legPanels[0].position.x) : null;
    positionDescription =
      insetMm !== null
        ? `脚は、天板の角から${insetMm}mm内側の位置に、天板の下面にそろえて4本とも取り付けます。幕板は4本の脚の内側同士をつなぐように、天板のすぐ下に取り付けます。`
        : '脚・幕板・天板の位置を仮に合わせ、向きや配置を確認します。';
  } else {
    const positionParts: string[] = ['天板・底板を、左右の側板の内側に挟み込むように仮組みします'];
    if (shelfCount > 0) {
      const shelfText = shelves
        .map((s, i) => `棚板${shelfCount > 1 ? i + 1 : ''}は下から${Math.round(s.position.z)}mmの高さ`)
        .join('、');
      positionParts.push(`${shelfText}に、水平になるよう取り付けます`);
    }
    if (hasBackPanel) positionParts.push('背板は本体の背面全体を覆うように取り付けます');
    if (hasLegs) {
      const insetMm = legPanels[0] ? Math.round(legPanels[0].position.x) : null;
      positionParts.push(
        insetMm !== null
          ? `脚は本体底面の四隅（端から${insetMm}mm内側）に取り付けます`
          : '脚は本体底面の四隅に取り付けます'
      );
    }
    positionDescription = `${positionParts.join('。')}。`;
  }

  // 「下穴を開ける」の具体化。板厚に対する下穴の深さの目安を数値で示す
  // （割れ防止の下穴＝ビス径よりひとまわり細い穴、という一般的なDIYの考え方をそのまま文章にする）
  const pilotHoleDepthMm = Math.max(1, Math.round(thicknessMm / 2));
  const pilotHoleDescription = `ビスを打つ位置は、板の端から20mm以上離してください。次に、ビスより一回り細い下穴（目安：直径2〜3mm）を、板厚${thicknessMm}mmに対して深さ${pilotHoleDepthMm}mmほど、割れ防止のためにあけます。`;

  // 「ビスで組み立てる」の具体化。板厚の1.5〜2倍程度を目安にビスの長さを提示する
  // （板を貫通させない範囲で、かつしっかり効かせるための一般的な目安）
  const screwLowMm = roundToNearest5(thicknessMm * 1.5);
  const screwHighMm = roundToNearest5(thicknessMm * 2);
  const assembleDescription = `${screwLowMm}〜${screwHighMm}mm程度の長さのビス（目安：板厚${thicknessMm}mmの1.5〜2倍）を使い、${assembleTargets}ます。1か所につき2本以上のビスで留めると、ねじれにくくなります。`;

  const steps: Omit<FurnitureBuildStep, 'stepNumber'>[] = [
    {
      title: '材料を準備する',
      description: '木取り図で選んだ材料と、必要な枚数がそろっているか確認します。',
    },
    {
      title: '木取り図を確認する',
      description: '木取り図を見ながら、どのパーツをどこから切り出すかを確認します。',
    },
    {
      title: '各パーツを寸法どおりにカットする',
      description: `パーツ一覧の寸法を確認しながら、${cutTargets}をカットします。`,
    },
    {
      title: 'カットしたパーツの寸法を確認する',
      description: '切り出したパーツが木取り図・パーツ一覧の寸法と合っているか、メジャーで確認します。',
    },
    {
      title: '組み立て位置を確認する',
      description: positionDescription,
    },
    {
      title: '下穴を開ける',
      description: pilotHoleDescription,
    },
    {
      title: 'ビスで組み立てる',
      description: assembleDescription,
    },
    {
      title: 'ガタつきや寸法を確認する',
      description:
        '全体がガタついていないか、直角や水平が保たれているかを確認します。対角線の長さを2方向で測り、同じ長さになっていれば歪みはありません（差があれば歪んでいるので、ゆるめて組み直します）。',
    },
    {
      title: '必要に応じて仕上げを行う',
      description: '角をやすりで整えたり、塗装やオイル仕上げをしたい場合はここで行います。',
    },
  ];

  return steps.map((s, i) => ({ stepNumber: i + 1, ...s }));
}

/** 「制作する」画面で表示する工具リスト。新しい工具データベースは作らず、
 * 既存のAssemblyManual（AIチャット側の組立説明書機能）が持つ工具リストをそのまま再利用する */
export const FURNITURE_BUILD_TOOLS: string[] = DEMO_ASSEMBLY_MANUAL.tools;

/** カットリストで使う、パーツの種類ごとの初心者向け名称。既存のFurniturePanelKindを
 * そのまま使い、新しいパーツ分類は作らない（左右の側板は同じ「側板」としてまとめて表示）。
 * 「作り方」の各ステップから「使用するパーツ」を特定する際（Phase 3-26）も、この既存の
 * 名称対応表を唯一の情報源として再利用する（'custom'は対応する名称がないため対象外になる） */
export const CUT_LIST_KIND_NAME: Partial<Record<FurniturePanelKind, string>> = {
  top: '天板',
  bottom: '底板',
  left: '側板',
  right: '側板',
  back: '背板',
  shelf: '棚板',
  leg: '脚',
  apron: '幕板',
  door: '扉',
  drawer: '引き出し',
};

// パーツ単位で材料を指定する際のキー。CUT_LIST_KIND_NAMEの値と同じ語彙を使うことで、
// 「天板だからパイン」「脚だからSPF」のような指定を、AIの提案（StudioSpec.partMaterials）・
// ブラウザCADの編集状態（buildFurnitureModelのoverrides.partMaterials）・保存データ
// （SavedFurnitureProject.partMaterials）のどこでも同じ形で扱えるようにする
export type PartMaterialLabel = '天板' | '底板' | '側板' | '背板' | '棚板' | '脚' | '幕板' | '扉' | '引き出し';
export const PART_MATERIAL_LABELS: PartMaterialLabel[] = [
  '天板',
  '底板',
  '側板',
  '背板',
  '棚板',
  '脚',
  '幕板',
  '扉',
  '引き出し',
];

// 脚・幕板は現実には規格材（SPF材等の角材）で作るパーツのため、パーツごとの材料選択で
// 板材（パイン集成材・合板等）を選べてしまうと「テーブルの脚が合板」のような、現実には
// ありえない組み合わせになってしまう。逆に天板・底板・側板・背板・棚板は板から切り出す
// パーツのため、規格材は選択肢に出さない。getFurnitureMaterialType（材料名→板材/規格材の
// 判定）をそのまま再利用し、パーツの種類ごとに矛盾しない材料だけを選べるようにする
const DIMENSIONAL_LUMBER_ONLY_LABELS: readonly PartMaterialLabel[] = ['脚', '幕板'];

export function getAllowedMaterialsForPartLabel(label: PartMaterialLabel): readonly FurnitureMaterial[] {
  const wantType: FurnitureMaterialType = DIMENSIONAL_LUMBER_ONLY_LABELS.includes(label)
    ? 'dimensionalLumber'
    : 'sheet';
  return FURNITURE_MATERIALS.filter((m) => getFurnitureMaterialType(m) === wantType);
}

// パーツ単位の色・仕上げ選択肢（PanelFinish、app/lib/cad/types.ts）のUI向け日本語ラベル。
// tanei-studio（旧設計スタジオ）のFINISH_OPTIONS（generate_model.py）・systemPrompt.tsの
// panelFinishes説明と同じ語彙・同じ4種類に揃えている。'clear'（クリア塗装）の場合は
// 材料そのものの色（MATERIAL_COLOR_HEX）がそのまま使われる（colorForPanel参照）
export const FURNITURE_FINISHES: { value: PanelFinish; label: string }[] = [
  { value: 'clear', label: 'クリア塗装（木目のまま）' },
  { value: 'walnut', label: 'ウォルナット調' },
  { value: 'white', label: 'ホワイト' },
  { value: 'black', label: 'ブラック' },
];

export interface CutListItem {
  /** name・寸法（材料混在時はmaterialも）から作る安定したキー。同じ寸法・同じ名称・同じ
   * 材料のパーツをまとめる際のグループキーにも、チェック状態を保存する際のキーにも使う */
  id: string;
  name: string;
  /** このパーツの材料（panel.material、無ければmodel.material）。常に埋まる */
  material: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  qty: number;
}

/** Panel[]から「カットする材料」一覧を作る。同じ名称・同じ寸法・同じ材料のパーツは1行に
 * まとめ、枚数（qty）を積み上げる。材料が異なるパーツは、寸法・名称が同じでも絶対に
 * 併合しない。新しい木取り計算は行わず、既存のPanel[]の寸法をそのまま集計するだけ。
 *
 * 【後方互換】全パネルが同じ材料（panel.materialの上書きが1つも無い）場合は、キーの形式を
 * 従来通り「名前__寸法」のままにする（材料をキーに含めない）。これにより、この機能より前に
 * 保存されたプロジェクトのcutListChecked（チェック済み状態）がそのまま一致し続ける。
 * 実際に複数材料が使われている設計だけ、新しいキー形式（材料__名前__寸法）になる
 * （その設計はこの機能より前には存在しえないため、互換性の問題は生じない） */
export function buildCutListItems(model: FurnitureModel): CutListItem[] {
  const hasPartMaterialOverride = model.panels.some(
    (panel) => panel.material !== undefined && panel.material !== model.material
  );

  const grouped = new Map<string, CutListItem>();
  let unnamedCount = 0;

  model.panels.forEach((panel) => {
    const dims = [panel.size.x, panel.size.y, panel.size.z].sort((a, b) => a - b);
    const thicknessMm = Math.round(dims[0]);
    const heightMm = Math.round(dims[1]);
    const widthMm = Math.round(dims[2]);
    const material = panel.material ?? model.material;

    let name = CUT_LIST_KIND_NAME[panel.kind];
    if (!name) {
      unnamedCount += 1;
      name = panel.label || `パーツ${unnamedCount}`;
    }

    const key = hasPartMaterialOverride
      ? `${material}__${name}__${widthMm}x${heightMm}x${thicknessMm}`
      : `${name}__${widthMm}x${heightMm}x${thicknessMm}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.qty += 1;
    } else {
      grouped.set(key, { id: key, name, material, widthMm, heightMm, thicknessMm, qty: 1 });
    }
  });

  return Array.from(grouped.values());
}

/** buildCutListItems()の結果のうち、getFurnitureMaterialTypeが'dimensionalLumber'と
 * 判定する材料（SPF材等）のパーツだけを取り出す。木取り図（サブロク板の対象外にした
 * furnitureModelToSheetLayoutsByMaterial）で表示しきれない規格材を、「必要な部材一覧」
 * として木取り図画面・PDFに表示するために使う。新しい集計ロジックは作らない */
export function furnitureModelToDimensionalLumberItems(model: FurnitureModel): CutListItem[] {
  return buildCutListItems(model).filter((item) => getFurnitureMaterialType(item.material) === 'dimensionalLumber');
}

/** マイページ（保存した設計一覧）で表示する、1プロジェクト分の制作進捗（Phase 2-8）。
 * cutListChecked・buildChecklistという既存データ（Phase 2-7）から画面表示のたびに
 * 計算するだけで、進捗率そのものを保存はしない */
export interface FurnitureProjectProgress {
  cutListDone: number;
  cutListTotal: number;
  /** falseの場合、現在の寸法ではどの定尺サイズにも収まらずカットリスト自体を作れない
   * （furnitureModelToSheetLayoutがnullを返す状態）。cutListTotalは0のまま */
  cutListAvailable: boolean;
  buildDone: number;
  buildTotal: number;
  isComplete: boolean;
}

// 制作チェックの固定10項目（Phase 2-7）。CadBuildChecklistView.tsx・CadBuildGuide.tsx
// （Phase 3-5）の両方から、ここを唯一の情報源として参照する（別々に配列を持たない）
export const BUILD_CHECKLIST_STEPS = [
  '材料を用意した',
  '木取り図を確認した',
  '材料に寸法を書いた',
  'パーツをカットした',
  'カット寸法を確認した',
  '組み立て位置を確認した',
  '下穴を確認した',
  '組み立てた',
  'ガタつきを確認した',
  '仕上げを行った',
] as const;

const BUILD_CHECKLIST_TOTAL_STEPS = BUILD_CHECKLIST_STEPS.length;

export interface NextBuildStep {
  stepNumber: number;
  label: string;
}

/** buildChecklistから「最初の未完了項目」を求める（Phase 2-9でCadBuildChecklistView.tsxに
 * 実装したものと全く同じロジック）。全て完了していれば、または旧バージョンデータで
 * buildChecklistが存在しない場合は、それぞれ正しい結果（完了 or 先頭のステップ）を返す */
export function getNextBuildStep(buildChecklist: Record<string, boolean> | undefined): NextBuildStep | null {
  const checked = buildChecklist ?? {};
  const index = BUILD_CHECKLIST_STEPS.findIndex((_, i) => !checked[String(i + 1)]);
  if (index === -1) return null;
  return { stepNumber: index + 1, label: BUILD_CHECKLIST_STEPS[index] };
}

export type BuildProgressStatus = 'not_started' | 'building' | 'completed';

/** マイページの保存済み設計一覧を進捗で絞り込む（Phase 3-17）ための3段階判定。
 * buildChecklistだけを見る純粋関数で、design/materialに依存しない（木取り計算が
 * 失敗するような壊れた保存データでも安全に呼び出せる）。buildChecklistが無い旧データ・
 * 空・未知のキーが混ざっている場合もクラッシュせず「未着手」側に倒れる */
export function getBuildProgressStatus(buildChecklist: Record<string, boolean> | undefined): BuildProgressStatus {
  const doneCount = Object.values(buildChecklist ?? {}).filter(Boolean).length;
  if (doneCount >= BUILD_CHECKLIST_TOTAL_STEPS) return 'completed';
  if (doneCount > 0) return 'building';
  return 'not_started';
}

export function computeFurnitureProjectProgress(
  design: FurnitureDesign,
  material: string,
  cutListChecked: Record<string, boolean> | undefined,
  buildChecklist: Record<string, boolean> | undefined,
  partMaterials?: Partial<Record<PartMaterialLabel, string>>
): FurnitureProjectProgress {
  let cutListTotal = 0;
  let cutListDone = 0;
  let cutListAvailable = false;

  try {
    const model = buildFurnitureModel(design, { material, partMaterials });
    const sheetLayout = furnitureModelToSheetLayout(model);
    if (sheetLayout) {
      cutListAvailable = true;
      const items = buildCutListItems(model);
      cutListTotal = items.length;
      const checked = cutListChecked ?? {};
      // 保存されているキーの中に、寸法変更等で今は存在しないパーツのものが残っていても
      // 数えないよう、現在のカットリスト項目と突き合わせてから数える
      cutListDone = items.filter((item) => checked[item.id]).length;
    }
  } catch {
    // 板厚に対して高さが小さすぎる等、寸法が壊れている保存データ。カットリストは
    // 「利用不可」として扱い、マイページ自体はクラッシュさせない
  }

  const buildDoneRaw = Object.values(buildChecklist ?? {}).filter(Boolean).length;
  const buildDone = Math.min(buildDoneRaw, BUILD_CHECKLIST_TOTAL_STEPS);

  return {
    cutListDone,
    cutListTotal,
    cutListAvailable,
    buildDone,
    buildTotal: BUILD_CHECKLIST_TOTAL_STEPS,
    isComplete: buildDone >= BUILD_CHECKLIST_TOTAL_STEPS,
  };
}

export interface MaterialPriceInfo {
  name: string;
  size: string;
  length: string;
  price: string;
  feature: string;
}

/** ブラウザCADの材料選択肢（FURNITURE_MATERIALS）と、既存のAIチャット側の木材価格目安
 * リスト（app/lib/constants.tsのKOHNAN_WOOD_LIST）を名前の一致だけで紐付ける。
 * 新しい価格データは作らず、一致しない場合は空配列を返す（呼び出し側で「価格情報なし」と
 * 表示し、存在しない価格を推測しない） */
export function findMaterialPriceInfo(materialName: string): MaterialPriceInfo[] {
  return KOHNAN_WOOD_LIST.filter(
    (wood) => wood.name.includes(materialName) || materialName.includes(wood.name)
  );
}

/** KOHNAN_WOOD_LISTの価格表記（「約1,200円〜」「約300〜500円」）を安全にパースする。
 * 数値を1つだけ読み取れた場合は「その金額以上（上限なし）」、2つ読み取れた場合は
 * 「下限〜上限」として扱う。想定外の表記は無理にパースせずnullを返す（推測しない） */
function parseWoodPriceRangeYen(priceText: string): { low: number; high: number | null } | null {
  const numbers = Array.from(priceText.matchAll(/[\d,]+/g))
    .map((m) => Number(m[0].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return { low: numbers[0], high: null };
  return { low: Math.min(...numbers), high: Math.max(...numbers) };
}

export interface MaterialCostBreakdownItem {
  /** KOHNAN_WOOD_LIST側のエントリ名（例:「SPF材（1×4）」）。同じ選択材料に複数の
   * 価格帯が対応する場合（SPF材の1×4/2×4等）、行が複数に分かれる */
  name: string;
  quantity: number;
  unitLow: number;
  unitHigh: number | null;
  subtotalLow: number;
  subtotalHigh: number | null;
}

export interface MaterialCostEstimate {
  items: MaterialCostBreakdownItem[];
  totalLow: number;
  /** nullの場合は「合計〇〇円以上」という上限なしの目安 */
  totalHigh: number | null;
}

/** 木取り図（既存app/lib/sheetLayout.ts）から求まる必要枚数と、既存のKOHNAN_WOOD_LISTの
 * 価格目安だけを掛け合わせて、家具1台分の「材料費の目安」を計算する純粋関数。
 * 新しい価格データ・新しい木取り計算は一切作らない。IndexedDB・AIへは一切アクセスしない。
 * 価格情報が1件も見つからない場合はnullを返す（呼び出し側で「価格情報なし」を表示する）。
 * ビス・ボンド・塗料等の副資材は対象外（価格データが存在しないため計算しない） */
export function calculateMaterialCostEstimate(
  material: string,
  requiredSheetCount: number
): MaterialCostEstimate | null {
  const items: MaterialCostBreakdownItem[] = [];

  findMaterialPriceInfo(material).forEach((wood) => {
    const range = parseWoodPriceRangeYen(wood.price);
    if (!range) return;
    items.push({
      name: wood.name,
      quantity: requiredSheetCount,
      unitLow: range.low,
      unitHigh: range.high,
      subtotalLow: range.low * requiredSheetCount,
      subtotalHigh: range.high !== null ? range.high * requiredSheetCount : null,
    });
  });

  if (items.length === 0) return null;

  // 同じ選択材料に複数の価格帯が対応する場合（SPF材の1×4/2×4等）は、どちらを選ぶかで
  // 金額が変わるため、最も安いケース〜最も高いケースの幅を「目安」として示す
  const totalLow = Math.min(...items.map((i) => i.subtotalLow));
  const anyOpenEnded = items.some((i) => i.subtotalHigh === null);
  const totalHigh = anyOpenEnded ? null : Math.max(...items.map((i) => i.subtotalHigh as number));

  return { items, totalLow, totalHigh };
}
