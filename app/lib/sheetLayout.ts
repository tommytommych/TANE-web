// 合板・MDF・OSBなど「縦×横」で木取りするシート材向けの2次元自動配置（ネスティング）ロジック。
// SPF材などの1次元（長さのみ）カットは cutSheetPdf.ts の packMaterialGroup を使う。

export interface SheetPart {
  widthMm: number;
  heightMm: number;
  qty: number;
  label?: string;
}

export interface SheetLayout {
  name: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  parts: SheetPart[];
}

export interface PlacedPiece {
  cutNumber: number;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
  label: string;
}

export interface LeftoverRect {
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
}

export interface PackedSheet {
  sheetWidthMm: number;
  sheetHeightMm: number;
  placed: PlacedPiece[];
  leftoverRects: LeftoverRect[];
  leftoverAreaMm2: number;
  yieldRate: number; // 0〜1（歩留まり）
}

const SHEET_KERF_MM = 3; // のこ刃の厚み分、配置計算時にだけ加味する（表示寸法は実寸のまま）

interface RectPiece {
  id: number;
  widthMm: number;
  heightMm: number;
  label: string;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const flattenParts = (parts: SheetPart[]): RectPiece[] => {
  let id = 0;
  const pieces: RectPiece[] = [];
  parts.forEach((part) => {
    for (let i = 0; i < part.qty; i++) {
      id += 1;
      pieces.push({ id, widthMm: part.widthMm, heightMm: part.heightMm, label: part.label ?? '' });
    }
  });
  return pieces;
};

// ギロチンカット方式の2次元ビンパッキング（Best Area Fit + 必要に応じて90度回転）
const packOneSheet = (
  sheetWidthMm: number,
  sheetHeightMm: number,
  pieces: RectPiece[]
): { placed: Omit<PlacedPiece, 'cutNumber'>[]; unplaced: RectPiece[]; freeRects: FreeRect[] } => {
  const freeRects: FreeRect[] = [{ x: 0, y: 0, width: sheetWidthMm, height: sheetHeightMm }];
  const placed: Omit<PlacedPiece, 'cutNumber'>[] = [];
  const unplaced: RectPiece[] = [];

  // 面積の大きいパーツから詰めた方が歩留まりが良くなりやすい
  const sorted = [...pieces].sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm);

  for (const piece of sorted) {
    const w = piece.widthMm + SHEET_KERF_MM;
    const h = piece.heightMm + SHEET_KERF_MM;

    let bestIndex = -1;
    let bestRotated = false;
    let bestWaste = Infinity;

    freeRects.forEach((rect, idx) => {
      if (w <= rect.width && h <= rect.height) {
        const waste = rect.width * rect.height - w * h;
        if (waste < bestWaste) {
          bestWaste = waste;
          bestIndex = idx;
          bestRotated = false;
        }
      }
      if (h <= rect.width && w <= rect.height) {
        const waste = rect.width * rect.height - w * h;
        if (waste < bestWaste) {
          bestWaste = waste;
          bestIndex = idx;
          bestRotated = true;
        }
      }
    });

    if (bestIndex === -1) {
      unplaced.push(piece);
      continue;
    }

    const rect = freeRects[bestIndex];
    const placedW = bestRotated ? h : w;
    const placedH = bestRotated ? w : h;

    placed.push({
      x: rect.x,
      y: rect.y,
      widthMm: bestRotated ? piece.heightMm : piece.widthMm,
      heightMm: bestRotated ? piece.widthMm : piece.heightMm,
      rotated: bestRotated,
      label: piece.label,
    });

    // 使った空き矩形を取り除き、ギロチン分割で2つの新しい空き矩形を作る
    freeRects.splice(bestIndex, 1);
    const rightW = rect.width - placedW;
    const bottomH = rect.height - placedH;

    if (rightW * rect.height > rect.width * bottomH) {
      if (rightW > 0) freeRects.push({ x: rect.x + placedW, y: rect.y, width: rightW, height: rect.height });
      if (bottomH > 0) freeRects.push({ x: rect.x, y: rect.y + placedH, width: placedW, height: bottomH });
    } else {
      if (bottomH > 0) freeRects.push({ x: rect.x, y: rect.y + placedH, width: rect.width, height: bottomH });
      if (rightW > 0) freeRects.push({ x: rect.x + placedW, y: rect.y, width: rightW, height: placedH });
    }
  }

  return { placed, unplaced, freeRects };
};

// 空き矩形リストから、他の空き矩形に完全に包含される（表示上重複する）ものを取り除く
const pruneContainedRects = (rects: FreeRect[]): FreeRect[] =>
  rects.filter((rect, idx) => {
    if (rect.width <= 0 || rect.height <= 0) return false;
    return !rects.some((other, otherIdx) => {
      if (idx === otherIdx) return false;
      return (
        rect.x >= other.x &&
        rect.y >= other.y &&
        rect.x + rect.width <= other.x + other.width &&
        rect.y + rect.height <= other.y + other.height
      );
    });
  });

// 1枚に収まりきらない場合は、必要な枚数分だけ自動でシートを追加して配置する
export const packSheetLayout = (layout: SheetLayout): PackedSheet[] => {
  let remaining = flattenParts(layout.parts);
  const sheets: PackedSheet[] = [];
  let cutCounter = 1;

  while (remaining.length > 0) {
    const { placed, unplaced, freeRects } = packOneSheet(layout.sheetWidthMm, layout.sheetHeightMm, remaining);

    // 1枚もパーツが置けない場合（パーツがシートより大きい等）は無限ループを避けて打ち切る
    if (placed.length === 0) break;

    const numbered: PlacedPiece[] = placed.map((p) => ({ ...p, cutNumber: cutCounter++ }));
    const usedAreaMm2 = placed.reduce((sum, p) => sum + p.widthMm * p.heightMm, 0);
    const totalAreaMm2 = layout.sheetWidthMm * layout.sheetHeightMm;

    const leftoverRects: LeftoverRect[] = pruneContainedRects(freeRects).map((r) => ({
      x: r.x,
      y: r.y,
      widthMm: r.width,
      heightMm: r.height,
    }));

    sheets.push({
      sheetWidthMm: layout.sheetWidthMm,
      sheetHeightMm: layout.sheetHeightMm,
      placed: numbered,
      leftoverRects,
      leftoverAreaMm2: Math.max(0, totalAreaMm2 - usedAreaMm2),
      yieldRate: totalAreaMm2 > 0 ? usedAreaMm2 / totalAreaMm2 : 0,
    });

    remaining = unplaced;
  }

  return sheets;
};

export const isValidSheetLayout = (value: unknown): value is SheetLayout => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.name !== 'string' ||
    typeof v.sheetWidthMm !== 'number' ||
    typeof v.sheetHeightMm !== 'number' ||
    !Array.isArray(v.parts)
  ) {
    return false;
  }
  return v.parts.every((p) => {
    if (typeof p !== 'object' || p === null) return false;
    const part = p as Record<string, unknown>;
    return (
      typeof part.widthMm === 'number' &&
      typeof part.heightMm === 'number' &&
      typeof part.qty === 'number' &&
      (part.label === undefined || typeof part.label === 'string')
    );
  });
};
