// 「AI空間DIY」の空間認識API。既存の/api/chatとは独立したエンドポイント
// （チャットのプローズ＋tanei-*ブロック方式ではなく、最初から構造化JSON出力を使うため）。
// モデル・APIキーは既存のチャット機能と完全に同じ'gemini-flash-latest' /
// process.env.GEMINI_API_KEYを使い、新しいモデル・新しい外部サービスは追加しない。
import { NextResponse } from 'next/server';
import { GoogleGenAI, createPartFromBase64, createPartFromText, type Part } from '@google/genai';
import { SPACE_DIY_SYSTEM_INSTRUCTION, SPACE_ANALYSIS_SCHEMA } from '../../lib/spaceDiy/prompt';
import { isValidSpaceAnalysis, type SpaceAnalysis } from '../../lib/spaceAnalysis';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const MAX_PHOTOS = 4;

const FRIENDLY_ERROR = {
  server: '通信エラーが発生しました。少し時間をおいてから、もう一度お試しください。',
  quota: '本日のAI利用回数の上限に達したようです🙏 しばらく時間をおいてから、もう一度お試しください。',
  noPhoto: '写真が添付されていません。少なくとも1枚、部屋の写真を選んでください。',
  invalidPhoto: '写真を読み込めませんでした。別の写真でもう一度お試しください。',
  invalidAnalysisResult:
    '写真の解析結果をうまく読み取れませんでした。もう一度お試しいただくか、別の角度から撮影した写真でお試しください。',
};

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const rawBody = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const photos = Array.isArray(rawBody.photos) ? rawBody.photos.filter((p): p is string => typeof p === 'string') : [];

    if (photos.length === 0) {
      return NextResponse.json({ error: FRIENDLY_ERROR.noPhoto }, { status: 400 });
    }

    const parts: Part[] = [];
    for (const photo of photos.slice(0, MAX_PHOTOS)) {
      const match = photo.match(/^data:(.+);base64,(.+)$/);
      if (!match) continue;
      const [, mimeType, base64Data] = match;
      parts.push(createPartFromBase64(base64Data, mimeType));
    }

    if (parts.length === 0) {
      return NextResponse.json({ error: FRIENDLY_ERROR.invalidPhoto }, { status: 400 });
    }

    parts.push(createPartFromText('この部屋の写真から、DIY家具を置けそうな空間を分析してください。'));

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SPACE_DIY_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: SPACE_ANALYSIS_SCHEMA,
      },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text ?? '');
    } catch {
      return NextResponse.json({ error: FRIENDLY_ERROR.invalidAnalysisResult }, { status: 502 });
    }

    if (!isValidSpaceAnalysis(parsed)) {
      return NextResponse.json({ error: FRIENDLY_ERROR.invalidAnalysisResult }, { status: 502 });
    }

    const analysis: SpaceAnalysis = parsed;
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('space-diy API Error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isQuotaError =
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('429') ||
      errorMessage.toLowerCase().includes('quota');

    return NextResponse.json(
      { error: isQuotaError ? FRIENDLY_ERROR.quota : FRIENDLY_ERROR.server },
      { status: isQuotaError ? 429 : 500 }
    );
  }
}
