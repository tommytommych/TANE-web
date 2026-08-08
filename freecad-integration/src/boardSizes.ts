import type { BoardSize } from './types';

// ホームセンター（コーナン・カインズ・コメリ等）で共通して手に入る、一般的な定尺サイズ。
// 小さいサイズ順に並べておき、部品が収まる最小の定尺を優先的に選ぶ（無駄な大判購入を避けるため）
export const STANDARD_BOARD_SIZES: BoardSize[] = [
  { label: 'サブロク板 (910×1820mm)', widthMm: 910, heightMm: 1820 },
  { label: 'シハチ板 (1210×2430mm)', widthMm: 1210, heightMm: 2430 },
];

// 与えられた部品群の最大寸法（回転を許容）が収まる、最小の定尺サイズを選ぶ。
// どれも収まらない場合はnullを返す（=特注サイズの検討が必要）
export function pickBoardSize(
  parts: { widthMm: number; depthMm: number }[],
  candidates: BoardSize[] = STANDARD_BOARD_SIZES
): BoardSize | null {
  const maxW = Math.max(...parts.map((p) => p.widthMm));
  const maxD = Math.max(...parts.map((p) => p.depthMm));

  const fitting = candidates.filter((board) => {
    const fitsAsIs = maxW <= board.widthMm && maxD <= board.heightMm;
    const fitsRotated = maxD <= board.widthMm && maxW <= board.heightMm;
    return fitsAsIs || fitsRotated;
  });

  if (fitting.length === 0) return null;

  return fitting.reduce((smallest, board) =>
    board.widthMm * board.heightMm < smallest.widthMm * smallest.heightMm ? board : smallest
  );
}
