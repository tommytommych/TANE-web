// Phase2でTANE:iのWeb版/LINE版からモジュールとして呼び出す際の公開API。
// 現時点ではローカルのファイル入出力に依存しない、純粋な関数群として提供する
export type {
  AnalysisResult,
  BoardSize,
  LeftoverRect,
  MaterialGroupResult,
  PackedBoard,
  PlacedPiece,
  RawPart,
} from './types';

export { parseParts, parsePartsFromCsv, parsePartsFromJson } from './parseParts';
export { analyzeParts } from './analyze';
export { pickBoardSize, STANDARD_BOARD_SIZES } from './boardSizes';
export { boardToSvg } from './svgExport';

import type { AnalysisResult } from './types';
import { parseParts } from './parseParts';
import { analyzeParts } from './analyze';

// CSV/JSONのテキストを受け取り、木取り解析結果までを一括で返す最上位のエントリーポイント。
// 将来的にAPIエンドポイント化する場合は、この関数をそのままハンドラーの中核に使える想定
export function analyzePartsText(text: string, filename?: string): AnalysisResult {
  const parts = parseParts(text, filename);
  return analyzeParts(parts);
}
