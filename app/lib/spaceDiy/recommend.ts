// AI空間認識の結果（SpaceAnalysis）と家具ライブラリー（FurnitureLibrary）を突き合わせて、
// 「この空間に置けそうな家具」の提案リストを作る。断定的な「置けます」判定はAI側の
// SpaceCandidate.recommendedFurnitureCategories（AIが写真から判断した候補カテゴリ）を
// そのまま尊重するだけで、ここでの独自の適合判定ロジックは持たない
// （指示書：「存在しないスペースを断定しない」「無理に家具を提案しない」）。
import { getFurnitureLibraryItemsByCategory, type FurnitureLibraryItem } from '../furnitureLibrary';
import type { SpaceAnalysis, SpaceCandidate } from '../spaceAnalysis';

export interface FurnitureProposal {
  id: string;
  furniture: FurnitureLibraryItem;
  space: SpaceCandidate;
  /** 空間の推定サイズを家具の可変範囲内に収めた、サイズ設定UIの初期値 */
  initialWidth: number;
  initialHeight: number;
  initialDepth: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// AIがrecommendedFurnitureCategoriesで挙げたカテゴリごとに、家具ライブラリーから
// 該当する家具を引き当てて提案化する。1つの家具は最初に該当した候補スペースにのみ
// 紐づける（同じ家具が複数の空きスペース候補に重複して出てくるのを防ぐ）
export const buildFurnitureProposals = (analysis: SpaceAnalysis): FurnitureProposal[] => {
  const proposals: FurnitureProposal[] = [];
  const usedFurnitureIds = new Set<string>();

  for (const space of analysis.spaces) {
    for (const category of space.recommendedFurnitureCategories) {
      for (const furniture of getFurnitureLibraryItemsByCategory(category)) {
        if (usedFurnitureIds.has(furniture.id)) continue;
        usedFurnitureIds.add(furniture.id);
        proposals.push({
          id: `${space.id}-${furniture.id}`,
          furniture,
          space,
          initialWidth: clamp(space.estimatedWidthMm ?? furniture.defaultWidth, furniture.minWidth, furniture.maxWidth),
          initialHeight: clamp(space.estimatedHeightMm ?? furniture.defaultHeight, furniture.minHeight, furniture.maxHeight),
          initialDepth: clamp(space.estimatedDepthMm ?? furniture.defaultDepth, furniture.minDepth, furniture.maxDepth),
        });
      }
    }
  }

  return proposals;
};
