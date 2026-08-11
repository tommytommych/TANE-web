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
import type { FurnitureDesign, FurnitureModel, FurniturePanel, ShelfEntry } from './types';
import { buildFurniturePanels, clampShelfEntry, defaultShelfSize, panelToCutSizeMm } from './geometry';

// systemPrompt.ts（tanei-studio-specブロック）・tanei-studio/freecad_scripts/generate_model.pyと
// 語彙を揃えている（AIの提案・FreeCAD版・ブラウザCADのどれでも同じ材質名で扱えるようにするため）
export const FURNITURE_MATERIALS = ['パイン集成材', 'シナベニヤ', 'ラワン合板', 'SPF材', 'OSB合板'] as const;
export type FurnitureMaterial = (typeof FURNITURE_MATERIALS)[number];

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

  let gapStart = minZ;
  let gapSize = maxZ - minZ;
  for (let i = 0; i < sortedZ.length - 1; i++) {
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
  overrides?: { projectId?: string; name?: string; material?: string }
): FurnitureModel {
  const material = overrides?.material ?? FURNITURE_MATERIALS[0];

  return {
    kind: 'furniture',
    projectId: overrides?.projectId ?? 'shelf-demo',
    name: overrides?.name ?? 'シンプルな木製棚',
    width: design.width,
    depth: design.depth,
    height: design.height,
    material,
    thickness: design.thickness,
    panels: buildFurniturePanels(design),
    options: { backPanel: design.backPanel, legs: design.legs, shelfCount: design.shelves.length },
  };
}

/** FurnitureModelのpanelsを、既存の木取り図PDF/SVG（app/lib/sheetLayout.ts,
 * app/lib/cutSheetPdf.ts）がそのまま受け取れるSheetLayoutへ変換する。
 * 新しいビンパッキングロジックは実装しない（既存ロジックの再利用）。 */
export function furnitureModelToSheetLayout(model: FurnitureModel): SheetLayout {
  const parts: SheetPart[] = model.panels.map((panel) => {
    const { widthMm, heightMm } = panelToCutSizeMm(panel);
    return { widthMm, heightMm, qty: 1, label: panel.label };
  });

  return {
    name: `${model.material}（${model.thickness}mm厚）`,
    // 国内ホームセンターの一般的なサブロク板サイズ。将来、材質ごとの定尺選定
    // （freecad-integration/src/boardSizes.tsのpickBoardSize相当）を組み込む余地を残す
    sheetWidthMm: 910,
    sheetHeightMm: 1820,
    parts,
  };
}

/** Three.js/React Three Fiber（Phase 2以降）でそのまま描画できる形式。
 * tanei-studio/server.pyのserialize_panels_for_viewer()と同じ形（label/x/y/z/dx/dy/dz/color）
 * にidを加えたもの。同じ役割のパネルが複数枚（棚板2枚など）あるとlabelが重複するため、
 * Reactのkeyにはpanel.idではなくlabelを使わないよう、idを別途持たせている */
export interface ViewerPanel {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  color: string;
}

const MATERIAL_COLOR_HEX: Record<string, string> = {
  パイン集成材: '#E8C9A0',
  シナベニヤ: '#E4D5B7',
  ラワン合板: '#C99A6C',
  SPF材: '#D9C29A',
  OSB合板: '#B8926A',
};
const DEFAULT_COLOR_HEX = '#D9C29A';
const LEG_COLOR_HEX = '#6B5B4A';

const FINISH_COLOR_HEX: Record<string, string> = {
  clear: DEFAULT_COLOR_HEX,
  walnut: '#5C3A21',
  white: '#F5F1E8',
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
    label: panel.label,
    x: panel.position.x,
    y: panel.position.y,
    z: panel.position.z,
    dx: panel.size.x,
    dy: panel.size.y,
    dz: panel.size.z,
    color: colorForPanel(panel, model.material),
  }));
}
