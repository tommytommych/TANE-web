// 「AI空間DIY」（部屋の写真からAIが家具を提案する新機能）の空間認識結果の型。
// チャットの`tanei-*`ブロック規約（プローズ+フェンス付きJSON）とは異なり、この機能は
// 独立したAPIエンドポイント（app/api/space-diy/route.ts）がGeminiの構造化出力モード
// （responseSchema）を使って直接JSONを受け取るため、正規表現での抽出は不要。
// 写真から取得した数値はすべてAIの目測であり実測値ではないため、フィールド名・型の両方で
// 「推定値」であることが分かるようにしている（estimated*Mm、confidenceはnull許容）。

export type DetectedObjectType = 'wall' | 'floor' | 'ceiling' | 'corner' | 'window' | 'door' | 'furniture';

export interface DetectedObject {
  type: DetectedObjectType;
  description: string | null;
  estimatedWidthMm: number | null;
  estimatedHeightMm: number | null;
  estimatedDepthMm: number | null;
}

// 家具を置けそうな候補スペース1件分。recommendedFurnitureCategoriesは、既存の
// 家具ライブラリー（app/lib/furnitureLibrary.tsのFurnitureCategory）のidのみを許可する
// よう、呼び出し側（Gemini構造化出力スキーマ）でenum制約をかける前提の文字列配列
export interface SpaceCandidate {
  id: string;
  name: string;
  description: string;
  estimatedWidthMm: number | null;
  estimatedHeightMm: number | null;
  estimatedDepthMm: number | null;
  /** AI自身の確信度（0〜1）。分からない場合はnull */
  confidence: number | null;
  recommendedFurnitureCategories: string[];
}

export interface SpaceAnalysis {
  spaces: SpaceCandidate[];
  detectedObjects: DetectedObject[];
  notes: string[];
  /** 写真からは空間・家具候補を十分に判断できなかった場合はtrue。
   * この場合、UI側は家具提案を行わず「もう少し別の角度から撮影してください」と案内する */
  insufficientData: boolean;
}

const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isNullableNumber = (v: unknown): v is number | null => v === null || typeof v === 'number';

const DETECTED_OBJECT_TYPES: readonly DetectedObjectType[] = [
  'wall',
  'floor',
  'ceiling',
  'corner',
  'window',
  'door',
  'furniture',
];

const isValidDetectedObject = (value: unknown): value is DetectedObject => {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    DETECTED_OBJECT_TYPES.includes(o.type as DetectedObjectType) &&
    isNullableString(o.description) &&
    isNullableNumber(o.estimatedWidthMm) &&
    isNullableNumber(o.estimatedHeightMm) &&
    isNullableNumber(o.estimatedDepthMm)
  );
};

const isValidSpaceCandidate = (value: unknown): value is SpaceCandidate => {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.description === 'string' &&
    isNullableNumber(s.estimatedWidthMm) &&
    isNullableNumber(s.estimatedHeightMm) &&
    isNullableNumber(s.estimatedDepthMm) &&
    (s.confidence === null || typeof s.confidence === 'number') &&
    Array.isArray(s.recommendedFurnitureCategories) &&
    s.recommendedFurnitureCategories.every((c) => typeof c === 'string')
  );
};

export const isValidSpaceAnalysis = (value: unknown): value is SpaceAnalysis => {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    Array.isArray(a.spaces) &&
    a.spaces.every(isValidSpaceCandidate) &&
    Array.isArray(a.detectedObjects) &&
    a.detectedObjects.every(isValidDetectedObject) &&
    Array.isArray(a.notes) &&
    a.notes.every((n) => typeof n === 'string') &&
    typeof a.insufficientData === 'boolean'
  );
};
