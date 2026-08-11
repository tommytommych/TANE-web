// FurnitureModelの作成・既存データ形式（木取り図・3Dビューア）への変換ヘルパー。
//
// 【重要】ここが「3D表示用データ・木取り図用データ・設計図用データがバラバラにならない」
// という方針の要になる。木取り図は新しい計算ロジックを作らず、既存のapp/lib/sheetLayout.ts
// （実績のある2次元ビンパッキング）へそのまま渡せる形に変換するだけにしている。

import type { SheetLayout, SheetPart } from '../sheetLayout';
import type { FurnitureModel, FurniturePanel } from './types';
import { buildDefaultFurniturePanels, panelToCutSizeMm } from './geometry';

// systemPrompt.ts（tanei-studio-specブロック）・tanei-studio/freecad_scripts/generate_model.pyと
// 語彙を揃えている（AIの提案・FreeCAD版・ブラウザCADのどれでも同じ材質名で扱えるようにするため）
export const FURNITURE_MATERIALS = ['パイン集成材', 'シナベニヤ', 'ラワン合板', 'SPF材', 'OSB合板'] as const;
export type FurnitureMaterial = (typeof FURNITURE_MATERIALS)[number];

const DEFAULT_THICKNESS_MM = 18;

/** 新規のFurnitureModelを、寸法だけ指定して作成する（panelsは自動計算）。
 * チャット側のtanei-studio-specブロックや、ユーザーの手入力どちらからも呼べる想定 */
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

  return {
    kind: 'furniture',
    projectId: input.projectId,
    name: input.name,
    width: input.width,
    depth: input.depth,
    height: input.height,
    material,
    thickness,
    panels: buildDefaultFurniturePanels({ width: input.width, depth: input.depth, height: input.height, thickness }),
    options: {},
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
 * にしてあるため、あちらの実装知見（カメラ位置・ライティング等）を移植しやすい */
export interface ViewerPanel {
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

const FINISH_COLOR_HEX: Record<string, string> = {
  clear: DEFAULT_COLOR_HEX,
  walnut: '#5C3A21',
  white: '#F5F1E8',
  black: '#2B2B2B',
};

function colorForPanel(panel: FurniturePanel, modelMaterial: string): string {
  if (panel.finish && panel.finish in FINISH_COLOR_HEX) return FINISH_COLOR_HEX[panel.finish];
  const material = panel.material ?? modelMaterial;
  return MATERIAL_COLOR_HEX[material] ?? DEFAULT_COLOR_HEX;
}

export function furnitureModelToViewerPanels(model: FurnitureModel): ViewerPanel[] {
  return model.panels.map((panel) => ({
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
