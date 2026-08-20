// 「AI空間DIY」のAI空間認識（app/api/space-diy/route.ts）専用のプロンプトとGemini構造化出力
// スキーマ。既存のsystemPrompt.ts（チャットのプローズ＋tanei-*ブロック方式）とは別の独立した
// フローのため、ここでは最初からJSON専用の出力形式（responseSchema）を使う。
// モデルは既存のチャット機能と同じ'gemini-flash-latest'（画像入力対応）を流用し、
// 新しいモデル・新しい外部サービスは一切追加しない。
import { Type, type Schema } from '@google/genai';
import { FURNITURE_LIBRARY } from '../furnitureLibrary';

const furnitureCatalogSummary = FURNITURE_LIBRARY.map(
  (f) => `- ${f.id}（${f.name}）: ${f.description} 標準サイズの目安は幅${f.defaultWidth}×高さ${f.defaultHeight}×奥行${f.defaultDepth}mm`
).join('\n');

export const SPACE_DIY_SYSTEM_INSTRUCTION = `
あなたはTANE:iの「AI空間DIY」機能のための空間認識エンジンです。
ユーザーが送ってきた部屋の写真（1〜4枚、正面・左側・右側・斜めなど異なる角度の場合がある）から、
DIY家具を置けそうな空間を分析してください。

【最重要・厳守事項】
- 写真に写っていない壁・窓・ドア・家具・スペースを、存在するかのように断定してはいけません。
- 寸法（幅・高さ・奥行）は写真からの目測にすぎず、正確な実測値ではありません。必ず「推定」として扱い、
  自信が持てない場合はnullにしてください（無理に数値を埋めない）。
- 写真が暗すぎる、壁がほとんど写っていない、対象スペースが家具や物で隠れている、極端に低画質、
  複数枚の内容が矛盾している等、十分な判断ができない場合は、insufficientDataをtrueにし、
  notesにその理由を具体的に書いてください。この場合、spacesは空配列でも構いません
  （無理に家具を提案しないでください）。
- confidenceは0（自信なし）〜1（自信あり）の数値で、正直に見積もってください。

【家具カテゴリ】recommendedFurnitureCategoriesには、以下のIDのみを使用してください（日本語名や
説明文をそのままIDとして使わないでください）。そのスペースに現実的に置けそうなカテゴリだけを
挙げ、当てはまるものが無ければ空配列にしてください。
${furnitureCatalogSummary}

【出力言語】name・description・notes・detectedObjectsのdescriptionは日本語で、初心者にも
分かりやすい言葉で書いてください。id・type・recommendedFurnitureCategoriesの値は上記の英語IDを
そのまま使ってください。
`.trim();

const nullableNumberSchema: Schema = { type: Type.NUMBER, nullable: true };
const nullableStringSchema: Schema = { type: Type.STRING, nullable: true };

const DETECTED_OBJECT_TYPES = ['wall', 'floor', 'ceiling', 'corner', 'window', 'door', 'furniture'] as const;
const FURNITURE_CATEGORY_IDS = FURNITURE_LIBRARY.map((f) => f.id);

const detectedObjectSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: [...DETECTED_OBJECT_TYPES] },
    description: nullableStringSchema,
    estimatedWidthMm: nullableNumberSchema,
    estimatedHeightMm: nullableNumberSchema,
    estimatedDepthMm: nullableNumberSchema,
  },
  required: ['type', 'description', 'estimatedWidthMm', 'estimatedHeightMm', 'estimatedDepthMm'],
};

const spaceCandidateSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: '例: "space-1"' },
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    estimatedWidthMm: nullableNumberSchema,
    estimatedHeightMm: nullableNumberSchema,
    estimatedDepthMm: nullableNumberSchema,
    confidence: { type: Type.NUMBER, nullable: true },
    recommendedFurnitureCategories: {
      type: Type.ARRAY,
      items: { type: Type.STRING, enum: FURNITURE_CATEGORY_IDS },
    },
  },
  required: [
    'id',
    'name',
    'description',
    'estimatedWidthMm',
    'estimatedHeightMm',
    'estimatedDepthMm',
    'confidence',
    'recommendedFurnitureCategories',
  ],
};

// app/api/space-diy/route.tsから、generateContentのconfig.responseSchemaへそのまま渡す
export const SPACE_ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    spaces: { type: Type.ARRAY, items: spaceCandidateSchema },
    detectedObjects: { type: Type.ARRAY, items: detectedObjectSchema },
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
    insufficientData: { type: Type.BOOLEAN },
  },
  required: ['spaces', 'detectedObjects', 'notes', 'insufficientData'],
};
