// 2次元ギロチンカット方式のビンパッキング（Best Area Fit + 必要に応じて90度回転）。
// TANE:i本体(app/lib/sheetLayout.ts)で実績のあるアルゴリズムを、依存関係のない
// 独立モジュールとして移植したもの。将来的にPhase2でメインリポジトリへ統合する際は、
// 重複を避けるため両者を共通ライブラリへ切り出すことを検討する。
import type { BoardSize, LeftoverRect, PackedBoard, PlacedPiece, RawPart } from './types';

const KERF_MM = 3; // のこ刃の厚み分。配置計算にのみ加味し、表示寸法は実寸のまま

interface RectPiece {
  id: number;
  name: string;
  widthMm: number;
  heightMm: number;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function flattenParts(parts: RawPart[]): RectPiece[] {
  let id = 0;
  const pieces: RectPiece[] = [];
  parts.forEach((part) => {
    for (let i = 0; i < part.qty; i++) {
      id += 1;
      pieces.push({ id, name: part.name, widthMm: part.widthMm, heightMm: part.depthMm });
    }
  });
  return pieces;
}

function packOneBoard(
  boardWidthMm: number,
  boardHeightMm: number,
  pieces: RectPiece[]
): { placed: Omit<PlacedPiece, 'cutNumber'>[]; unplaced: RectPiece[]; freeRects: FreeRect[] } {
  const freeRects: FreeRect[] = [{ x: 0, y: 0, width: boardWidthMm, height: boardHeightMm }];
  const placed: Omit<PlacedPiece, 'cutNumber'>[] = [];
  const unplaced: RectPiece[] = [];

  // 面積の大きいパーツから詰めた方が歩留まりが良くなりやすい
  const sorted = [...pieces].sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm);

  for (const piece of sorted) {
    const w = piece.widthMm + KERF_MM;
    const h = piece.heightMm + KERF_MM;

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
      name: piece.name,
      x: rect.x,
      y: rect.y,
      widthMm: bestRotated ? piece.heightMm : piece.widthMm,
      heightMm: bestRotated ? piece.widthMm : piece.heightMm,
      rotated: bestRotated,
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
}

// 空き矩形リストから、他の空き矩形に完全に包含される（重複表示になる）ものを取り除く
function pruneContainedRects(rects: FreeRect[]): FreeRect[] {
  return rects.filter((rect, idx) => {
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
}

// 指定の定尺サイズに対して、1枚に収まりきらない分は必要枚数だけ自動で板を追加して配置する
export function packParts(parts: RawPart[], boardSize: BoardSize): { boards: PackedBoard[]; unplaced: RawPart[] } {
  let remaining = flattenParts(parts);
  const boards: PackedBoard[] = [];
  let cutCounter = 1;
  let boardIndex = 0;

  while (remaining.length > 0) {
    const { placed, unplaced, freeRects } = packOneBoard(boardSize.widthMm, boardSize.heightMm, remaining);

    // 1枚もパーツが置けない場合（部品が定尺より大きい等）は無限ループを避けて打ち切る
    if (placed.length === 0) break;

    boardIndex += 1;
    const numbered: PlacedPiece[] = placed.map((p) => ({ ...p, cutNumber: cutCounter++ }));
    const usedAreaMm2 = placed.reduce((sum, p) => sum + p.widthMm * p.heightMm, 0);
    const totalAreaMm2 = boardSize.widthMm * boardSize.heightMm;

    const leftoverRects: LeftoverRect[] = pruneContainedRects(freeRects).map((r) => ({
      x: r.x,
      y: r.y,
      widthMm: r.width,
      heightMm: r.height,
    }));

    boards.push({
      boardIndex,
      boardSize,
      placed: numbered,
      leftoverRects,
      yieldRate: totalAreaMm2 > 0 ? usedAreaMm2 / totalAreaMm2 : 0,
    });

    remaining = unplaced;
  }

  // 最後まで置けなかった個々のピースを、元のRawPart単位（qty=1）に戻して返す
  const unplacedParts: RawPart[] = remaining.map((piece) => ({
    name: piece.name,
    widthMm: piece.widthMm,
    depthMm: piece.heightMm,
    thicknessMm: 0,
    material: '',
    qty: 1,
  }));

  return { boards, unplaced: unplacedParts };
}
