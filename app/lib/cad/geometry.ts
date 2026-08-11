// FurnitureModelの外形寸法（width/depth/height/thickness）から、天板・底板・側板×2・背板の
// 5枚のパネル（位置・サイズ）を自動計算する。tanei-studio/freecad_scripts/generate_model.pyの
// compute_panels()と同じ座標系・同じ考え方（原点は本体の左手前下、天板・底板が外寸いっぱい、
// 側板がその間、背板がさらに側板の内側に収まる箱組み）を採用しているため、将来
// 「FreeCAD版と計算結果を突き合わせて検証する」といった移行検証がしやすい。
//
// 【重要】ここで生成するpanelsが、3D CADビューア（Phase 3）・木取り図（model.ts経由で
// 既存app/lib/sheetLayout.tsへ変換）・将来の設計図生成の、共通の唯一の入力になる。

import type { FurnitureModel, FurniturePanel, Vector3Mm } from './types';

const vec3 = (x: number, y: number, z: number): Vector3Mm => ({ x, y, z });

interface BoxDimensions {
  width: number;
  depth: number;
  height: number;
  thickness: number;
}

/**
 * 天板・底板・側板×2・背板からなる、最もシンプルな箱型家具のパネル一式を計算する。
 * 引き出し・扉・棚板などの追加パーツはPhase 2以降で拡充する（FurnitureModel.optionsの領域）。
 */
export function buildDefaultFurniturePanels({ width, depth, height, thickness: t }: BoxDimensions): FurniturePanel[] {
  if (width <= 0 || depth <= 0 || height <= 0 || t <= 0) {
    throw new Error('width/depth/height/thicknessは正の数値で指定してください。');
  }
  if (height <= t * 2) {
    throw new Error('heightが板厚に対して小さすぎます（天板・底板の厚み分を確保できません）。');
  }

  const panels: FurniturePanel[] = [
    {
      id: 'top',
      kind: 'top',
      label: '天板',
      position: vec3(0, 0, height - t),
      size: vec3(width, depth, t),
    },
    {
      id: 'bottom',
      kind: 'bottom',
      label: '底板',
      position: vec3(0, 0, 0),
      size: vec3(width, depth, t),
    },
    {
      id: 'left',
      kind: 'left',
      label: '側板（左）',
      position: vec3(0, 0, t),
      size: vec3(t, depth, height - t * 2),
    },
    {
      id: 'right',
      kind: 'right',
      label: '側板（右）',
      position: vec3(width - t, 0, t),
      size: vec3(t, depth, height - t * 2),
    },
    {
      id: 'back',
      kind: 'back',
      label: '背板',
      position: vec3(t, depth - t, t),
      size: vec3(width - t * 2, t, height - t * 2),
    },
  ];

  return panels;
}

/**
 * 棚板を1枚追加する（kind='shelf'の実例）。zAtMmは本体内部での高さ位置（mm、底面基準）。
 * 側板の内側に収まる幅・背板の手前までの奥行きで自動計算する。
 */
export function addShelfPanel(
  model: Pick<FurnitureModel, 'width' | 'depth' | 'thickness'>,
  zAtMm: number,
  id = `shelf-${Math.round(zAtMm)}`
): FurniturePanel {
  const t = model.thickness;
  return {
    id,
    kind: 'shelf',
    label: '棚板',
    position: vec3(t, 0, zAtMm),
    size: vec3(model.width - t * 2, model.depth - t, t),
  };
}

/**
 * 天板・底板・側板×2・背板（buildDefaultFurniturePanels）に加え、内部を等間隔に
 * 区切る棚板をshelfCount枚追加した、シンプルな木製棚のパネル一式を計算する。
 */
export function buildShelfDesignPanels(dims: BoxDimensions, shelfCount: number): FurniturePanel[] {
  const panels = buildDefaultFurniturePanels(dims);
  const interiorStart = dims.thickness;
  const interiorEnd = dims.height - dims.thickness;

  for (let i = 1; i <= shelfCount; i++) {
    const zAtMm = interiorStart + ((interiorEnd - interiorStart) * i) / (shelfCount + 1);
    panels.push(addShelfPanel(dims, zAtMm, `shelf-${i}`));
  }

  return panels;
}

/** パネルの3辺(dx,dy,dz)のうち、板厚に相当する最小の1辺を除いた残り2辺を、
 * 木取り図（2次元カット）用の縦横寸法として返す。どの向きの板でも正しく板厚軸を除ける */
export function panelToCutSizeMm(panel: FurniturePanel): { widthMm: number; heightMm: number } {
  const dims = [panel.size.x, panel.size.y, panel.size.z].sort((a, b) => a - b);
  const [, mid, largest] = dims;
  return { widthMm: Math.round(largest), heightMm: Math.round(mid) };
}
