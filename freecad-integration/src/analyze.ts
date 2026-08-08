import type { AnalysisResult, MaterialGroupResult, RawPart } from './types';
import { pickBoardSize, STANDARD_BOARD_SIZES } from './boardSizes';
import { packParts } from './optimizer';

function groupKey(part: RawPart): string {
  return `${part.material}__${part.thicknessMm}`;
}

// 材質・厚みごとに部品をグルーピングし、それぞれに適した定尺サイズで木取りを行う。
// これがPhase1の中心ロジック：「入力された寸法・枚数」→「木取り図」「必要材料リスト」
export function analyzeParts(parts: RawPart[]): AnalysisResult {
  const warnings: string[] = [];
  const groupsMap = new Map<string, RawPart[]>();

  parts.forEach((part) => {
    const key = groupKey(part);
    const list = groupsMap.get(key) ?? [];
    list.push(part);
    groupsMap.set(key, list);
  });

  const groups: MaterialGroupResult[] = [];

  groupsMap.forEach((groupParts) => {
    const { material, thicknessMm } = groupParts[0];
    const boardSize = pickBoardSize(groupParts, STANDARD_BOARD_SIZES);

    if (!boardSize) {
      warnings.push(
        `材質「${material}」厚み${thicknessMm}mmのグループに、定尺サイズに収まらない部品が含まれています。特注サイズの検討が必要です。`
      );
      groups.push({
        material,
        thicknessMm,
        boardSize: STANDARD_BOARD_SIZES[STANDARD_BOARD_SIZES.length - 1],
        boards: [],
        totalBoardsNeeded: 0,
        averageYieldRate: 0,
        unplacedParts: groupParts,
      });
      return;
    }

    const { boards, unplaced } = packParts(groupParts, boardSize);

    if (unplaced.length > 0) {
      warnings.push(
        `材質「${material}」厚み${thicknessMm}mmで、${unplaced.length}個の部品が${boardSize.label}に配置しきれませんでした。`
      );
    }

    const averageYieldRate =
      boards.length > 0 ? boards.reduce((sum, b) => sum + b.yieldRate, 0) / boards.length : 0;

    groups.push({
      material,
      thicknessMm,
      boardSize,
      boards,
      totalBoardsNeeded: boards.length,
      averageYieldRate,
      unplacedParts: unplaced,
    });
  });

  return {
    groups,
    totalBoardsAllGroups: groups.reduce((sum, g) => sum + g.totalBoardsNeeded, 0),
    warnings,
  };
}
