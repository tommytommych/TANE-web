// FurnitureDesign（幅/奥行/高さ/板厚・背板の有無・脚の有無・棚板リスト）から、
// 実際のパネル（位置・サイズ）一式を計算する。tanei-studio/freecad_scripts/generate_model.pyの
// compute_panels()と同じ座標系（原点は本体の左手前下、天板・底板が外寸いっぱい、
// 側板がその間、背板がさらに側板の内側に収まる箱組み）を採用している。
//
// 【重要】ここで生成するpanelsが、3D CADビューア・木取り図（model.ts経由で既存
// app/lib/sheetLayout.tsへ変換）・将来の設計図生成の、共通の唯一の入力になる。
// 3Dオブジェクトそのものではなく、常にこのFurnitureDesignが状態管理の中心になる。

import type { FurnitureDesign, FurniturePanel, ShelfEntry, Vector3Mm } from './types';

const vec3 = (x: number, y: number, z: number): Vector3Mm => ({ x, y, z });
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

interface BoxDimensions {
  width: number;
  depth: number;
  height: number;
  thickness: number;
}

/**
 * 天板・底板・側板×2・背板からなる、最もシンプルな箱型家具のパネル一式を計算する。
 * 背板の有無はbuildFurniturePanels側で制御する（ここでは常に背板込みで返す）。
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

const MIN_SHELF_SIZE_MM = 50;

/** 棚板の幅・奥行きの既定値（側板の内側いっぱい。背板があればその手前まで）。
 * 棚板追加時や、家具全体の寸法変更で既存棚板をクランプする際の上限にも使う */
export function defaultShelfSize(
  design: Pick<FurnitureDesign, 'width' | 'depth' | 'thickness' | 'backPanel'>
): { widthMm: number; depthMm: number } {
  const t = design.thickness;
  return {
    widthMm: Math.max(MIN_SHELF_SIZE_MM, design.width - t * 2),
    depthMm: Math.max(MIN_SHELF_SIZE_MM, design.backPanel ? design.depth - t : design.depth),
  };
}

/**
 * 棚板1枚の高さ・幅・奥行きを、現在の家具寸法で「側板・天板・底板・背板を突き抜けない」
 * 範囲へ自動的に収める。家具全体の寸法変更・背板ON/OFF・棚板自身の編集、
 * いずれの操作後にも必ずこれを通すことで、家具全体の構造が壊れないようにしている。
 */
export function clampShelfEntry(
  design: Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness' | 'backPanel'>,
  shelf: ShelfEntry
): ShelfEntry {
  const t = design.thickness;
  const { widthMm: maxWidth, depthMm: maxDepth } = defaultShelfSize(design);
  const minZ = t;
  const maxZ = Math.max(minZ, design.height - t);

  return {
    id: shelf.id,
    zAtMm: clamp(shelf.zAtMm, minZ, maxZ),
    widthMm: clamp(shelf.widthMm, MIN_SHELF_SIZE_MM, maxWidth),
    depthMm: clamp(shelf.depthMm, MIN_SHELF_SIZE_MM, maxDepth),
  };
}

function shelfEntryToPanel(
  design: Pick<FurnitureDesign, 'width' | 'thickness'>,
  shelf: ShelfEntry,
  displayIndex: number
): FurniturePanel {
  const t = design.thickness;
  const interiorWidth = design.width - t * 2;
  // 棚板の幅が側板間いっぱいより狭い場合は、左右中央に配置する
  const x = t + (interiorWidth - shelf.widthMm) / 2;

  return {
    id: shelf.id,
    kind: 'shelf',
    label: `棚板${displayIndex + 1}`,
    position: vec3(x, 0, shelf.zAtMm),
    size: vec3(shelf.widthMm, shelf.depthMm, t),
  };
}

const LEG_SIZE_MM = 30;
const LEG_HEIGHT_MM = 80;

/** 4本脚（左前・右前・左奥・右奥）を、本体底面のすぐ下に配置する。
 * 個別の脚の高さ調整・本数変更はPhase 2-3以降の検討課題とし、今回はON/OFFのみ */
function buildLegPanels({ width, depth, thickness: t }: BoxDimensions): FurniturePanel[] {
  const positions: { id: string; label: string; x: number; y: number }[] = [
    { id: 'leg-front-left', label: '脚（前左）', x: t, y: t },
    { id: 'leg-front-right', label: '脚（前右）', x: width - t - LEG_SIZE_MM, y: t },
    { id: 'leg-back-left', label: '脚（奥左）', x: t, y: depth - t - LEG_SIZE_MM },
    { id: 'leg-back-right', label: '脚（奥右）', x: width - t - LEG_SIZE_MM, y: depth - t - LEG_SIZE_MM },
  ];

  return positions.map((p) => ({
    id: p.id,
    kind: 'leg',
    label: p.label,
    position: vec3(p.x, p.y, -LEG_HEIGHT_MM),
    size: vec3(LEG_SIZE_MM, LEG_SIZE_MM, LEG_HEIGHT_MM),
  }));
}

// テーブル（天板+脚+幕板）専用の寸法定数。箱型のLEG_SIZE_MM/LEG_HEIGHT_MMとは別に持つ
// （箱型の脚は本体の下にぶら下がる短い飾り脚、テーブルの脚は床から天板下面まで届く
// 構造材のため、太さ・高さの考え方がそもそも異なる）
const TABLE_LEG_SIZE_MM = 40;
const TABLE_LEG_INSET_MM = 20;
const TABLE_APRON_HEIGHT_MM = 80;

// SPF材（2×4）の実寸（厚み×幅）。app/lib/constants.tsのKOHNAN_WOOD_LISTの
// 'SPF材（2×4）'エントリ（厚38×幅89mm）と同じ値。脚・幕板の材料としてSPF材が
// 選ばれた場合のみ、テーブルの脚・幕板の断面にこの実寸を反映する（新しい固定値を
// 増やすのではなく、既存の価格目安データと同じ値を使う）
const SPF_2X4_THICKNESS_MM = 38;
const SPF_2X4_WIDTH_MM = 89;

interface CrossSection {
  widthXMm: number;
  widthYMm: number;
}

/** 脚の材料としてSPF材が選ばれている場合のみ、実際の2×4断面（38×89mm）を使う。
 * それ以外の材料（未指定含む）では従来通りの正方形断面（40×40mm）のまま */
function resolveLegCrossSection(legMaterial: string | undefined): CrossSection {
  if (legMaterial === 'SPF材') {
    return { widthXMm: SPF_2X4_THICKNESS_MM, widthYMm: SPF_2X4_WIDTH_MM };
  }
  return { widthXMm: TABLE_LEG_SIZE_MM, widthYMm: TABLE_LEG_SIZE_MM };
}

interface ApronCrossSection {
  thicknessMm: number;
  heightMm: number;
}

/** 幕板の材料としてSPF材が選ばれている場合のみ、実際の2×4断面（厚み38mm・見付け高さ89mm）を
 * 使う。それ以外の材料（未指定含む）では従来通り、板厚（design.thickness）を厚みに、
 * TABLE_APRON_HEIGHT_MMを見付け高さに使う */
function resolveApronCrossSection(apronMaterial: string | undefined, defaultThicknessMm: number): ApronCrossSection {
  if (apronMaterial === 'SPF材') {
    return { thicknessMm: SPF_2X4_THICKNESS_MM, heightMm: SPF_2X4_WIDTH_MM };
  }
  return { thicknessMm: defaultThicknessMm, heightMm: TABLE_APRON_HEIGHT_MM };
}

export interface TableMaterials {
  /** 脚の材料。'SPF材'のときだけ断面を2×4実寸に変更する。省略時は従来通りの断面 */
  legMaterial?: string;
  /** 幕板の材料。'SPF材'のときだけ断面を2×4実寸に変更する。省略時は従来通りの断面 */
  apronMaterial?: string;
}

/**
 * テーブル（天板+脚4本+幕板4枚）のパネル一式を計算する。箱型のbuildDefaultFurniturePanelsと
 * 対になる関数。天板・底板・側板・背板といった箱型固有の語彙は一切使わない。
 * 脚は床（z=0）から天板下面まで届くフルハイトで配置し、幕板は天板のすぐ下で
 * 隣り合う脚同士をつなぐ枠として配置する（実際の仕口を厳密に再現するものではなく、
 * 木取り図・3D表示・作り方ガイド向けの簡易的な構造表現）
 */
export function buildDefaultTablePanels(
  { width, depth, height, thickness: t }: BoxDimensions,
  materials?: TableMaterials
): FurniturePanel[] {
  if (width <= 0 || depth <= 0 || height <= 0 || t <= 0) {
    throw new Error('width/depth/height/thicknessは正の数値で指定してください。');
  }

  const legCross = resolveLegCrossSection(materials?.legMaterial);
  const apronCross = resolveApronCrossSection(materials?.apronMaterial, t);

  const legHeight = height - t;
  if (legHeight <= apronCross.heightMm) {
    throw new Error('heightが天板の厚み・幕板の高さに対して小さすぎます。');
  }

  const legX1 = TABLE_LEG_INSET_MM;
  const legX2 = width - TABLE_LEG_INSET_MM - legCross.widthXMm;
  const legY1 = TABLE_LEG_INSET_MM;
  const legY2 = depth - TABLE_LEG_INSET_MM - legCross.widthYMm;
  if (legX2 <= legX1 || legY2 <= legY1) {
    throw new Error('widthまたはdepthが脚を配置するには小さすぎます。');
  }

  const panels: FurniturePanel[] = [
    {
      id: 'top',
      kind: 'top',
      label: '天板',
      position: vec3(0, 0, height - t),
      size: vec3(width, depth, t),
    },
  ];

  const legPositions: { id: string; label: string; x: number; y: number }[] = [
    { id: 'leg-front-left', label: '脚（前左）', x: legX1, y: legY1 },
    { id: 'leg-front-right', label: '脚（前右）', x: legX2, y: legY1 },
    { id: 'leg-back-left', label: '脚（奥左）', x: legX1, y: legY2 },
    { id: 'leg-back-right', label: '脚（奥右）', x: legX2, y: legY2 },
  ];
  for (const p of legPositions) {
    panels.push({
      id: p.id,
      kind: 'leg',
      label: p.label,
      position: vec3(p.x, p.y, 0),
      size: vec3(legCross.widthXMm, legCross.widthYMm, legHeight),
    });
  }

  const apronZ = legHeight - apronCross.heightMm;
  const apronSpanX = legX2 - (legX1 + legCross.widthXMm);
  const apronSpanY = legY2 - (legY1 + legCross.widthYMm);
  const aprons: { id: string; label: string; position: Vector3Mm; size: Vector3Mm }[] = [
    {
      id: 'apron-front',
      label: '幕板（前）',
      position: vec3(legX1 + legCross.widthXMm, legY1, apronZ),
      size: vec3(apronSpanX, apronCross.thicknessMm, apronCross.heightMm),
    },
    {
      id: 'apron-back',
      label: '幕板（奥）',
      position: vec3(legX1 + legCross.widthXMm, legY2 + legCross.widthYMm - apronCross.thicknessMm, apronZ),
      size: vec3(apronSpanX, apronCross.thicknessMm, apronCross.heightMm),
    },
    {
      id: 'apron-left',
      label: '幕板（左）',
      position: vec3(legX1, legY1 + legCross.widthYMm, apronZ),
      size: vec3(apronCross.thicknessMm, apronSpanY, apronCross.heightMm),
    },
    {
      id: 'apron-right',
      label: '幕板（右）',
      position: vec3(legX2 + legCross.widthXMm - apronCross.thicknessMm, legY1 + legCross.widthYMm, apronZ),
      size: vec3(apronCross.thicknessMm, apronSpanY, apronCross.heightMm),
    },
  ];
  for (const a of aprons) {
    panels.push({ id: a.id, kind: 'apron', label: a.label, position: a.position, size: a.size });
  }

  return panels;
}

/**
 * FurnitureDesign全体から、実際に描画・木取りに使うパネル一式を計算する
 * （FurnitureDesign → Panel[]の変換の本体）。
 */
export function buildFurniturePanels(design: FurnitureDesign, materials?: TableMaterials): FurniturePanel[] {
  const dims: BoxDimensions = {
    width: design.width,
    depth: design.depth,
    height: design.height,
    thickness: design.thickness,
  };

  if (design.kind === 'table') {
    return buildDefaultTablePanels(dims, materials);
  }

  let panels = buildDefaultFurniturePanels(dims);
  if (!design.backPanel) {
    panels = panels.filter((p) => p.kind !== 'back');
  }

  const sortedShelves = [...design.shelves].sort((a, b) => a.zAtMm - b.zAtMm);
  const shelfPanels = sortedShelves.map((shelf, i) =>
    shelfEntryToPanel(design, clampShelfEntry(design, shelf), i)
  );

  if (design.legs) {
    panels = [...panels, ...buildLegPanels(dims)];
  }

  return [...panels, ...shelfPanels];
}

/** パネルの3辺(dx,dy,dz)のうち、板厚に相当する最小の1辺を除いた残り2辺を、
 * 木取り図（2次元カット）用の縦横寸法として返す。どの向きの板でも正しく板厚軸を除ける */
export function panelToCutSizeMm(panel: FurniturePanel): { widthMm: number; heightMm: number } {
  const dims = [panel.size.x, panel.size.y, panel.size.z].sort((a, b) => a - b);
  const [, mid, largest] = dims;
  return { widthMm: Math.round(largest), heightMm: Math.round(mid) };
}
