import { NextResponse } from 'next/server';
import {
  GoogleGenAI,
  createPartFromBase64,
  createPartFromText,
  type Content,
  type Part,
} from '@google/genai';
import { getOrCreateAnonymousUserId } from '../../lib/anonymousUser';
import { consumeUsage, getRemainingCount } from '../../lib/rateLimit';
import { buildSystemInstruction, CAMEO_MODE_TRIGGER_REGEX } from '../../lib/systemPrompt';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const DAILY_LIMIT_MESSAGE =
  '本日の無料相談回数の上限（10回）に達しました🙏 また明日、あらためてご相談ください。';

interface HistoryTurn {
  role: string;
  content: string;
  image?: string;
}

interface DesignContext {
  item: string | null;
  size: string | null;
  place: string | null;
  budget: string | null;
  tools: string | null;
  experience: string | null;
  material: string | null;
}

const isValidDesignContext = (value: unknown): value is DesignContext => {
  if (typeof value !== 'object' || value === null) return false;
  const keys = ['item', 'size', 'place', 'budget', 'tools', 'experience', 'material'];
  const c = value as Record<string, unknown>;
  return keys.every((key) => c[key] === null || typeof c[key] === 'string');
};

const isValidHistoryTurn = (value: unknown): value is HistoryTurn => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.role === 'string' && typeof v.content === 'string' && (v.image === undefined || typeof v.image === 'string');
};

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const rawBody = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const history: HistoryTurn[] = Array.isArray(rawBody.history) ? rawBody.history.filter(isValidHistoryTurn) : [];
    const context: DesignContext | null = isValidDesignContext(rawBody.context) ? rawBody.context : null;
    // クイックスタートカード等、本来の「無料相談」としてカウントしない送信ではfalseを渡す
    // （フロント側のcountUpと対応。未指定時はカウントする）
    const countUsage = rawBody.countUsage !== false;

    // 「シルエットカメオデザイン」メニューから始まる相談、または会話中に言及された場合は
    // カメオモードに切り替え、木取り図・組立説明書ではなくデザイン候補を提案させる
    const isCameoMode = history.some((h) => CAMEO_MODE_TRIGGER_REGEX.test(h.content));

    const contents: Content[] = history
      .map((turn, i): Content | null => {
        const parts: Part[] = [];

        if (typeof turn.content === 'string' && turn.content.trim()) {
          parts.push(createPartFromText(turn.content));
        }

        // 画像データは容量が大きいため、直近のメッセージのみ送信する
        if (i === history.length - 1 && typeof turn.image === 'string') {
          const match = turn.image.match(/^data:(.+);base64,(.+)$/);
          if (match) {
            const [, mimeType, base64Data] = match;
            parts.push(createPartFromBase64(base64Data, mimeType));
          }
        }

        if (parts.length === 0) return null;

        return {
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      })
      .filter((c): c is Content => c !== null);

    if (contents.length === 0) {
      return NextResponse.json({ reply: 'メッセージが空です。' }, { status: 400 });
    }

    // 実際にGeminiを呼ぶ直前で利用回数をチェック・消費する
    // （空メッセージなど、そもそもAPIを呼ばないケースでは消費しない）
    const userId = await getOrCreateAnonymousUserId();
    const remaining = countUsage ? await consumeUsage(userId) : await getRemainingCount(userId);

    if (remaining === null) {
      return NextResponse.json(
        { reply: DAILY_LIMIT_MESSAGE, errorType: 'daily-limit', remaining: 0 },
        { status: 429 }
      );
    }

    // フロントエンドが直前の回答から抽出したContextを、システムインストラクションに明示的に注入する。
    // 会話履歴の文章から毎回推測させるより、構造化データとして渡す方が精度が安定する。
    const contextNote = context
      ? `\n\n【これまでに判明している情報（Context）】\n${JSON.stringify(context)}\n上記のうち値がnullの項目を優先して、次の質問を1つだけしてください。item・size・place・budget・experienceが埋まっていれば設計を開始してください。`
      : '';

    // 常に最新のGemini Flashモデルを指すエイリアスを使用
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents,
      config: {
        systemInstruction: buildSystemInstruction({ isCameoMode }) + contextNote,
      },
    });

    const replyText = response.text || 'DIYの提案を作成しました。';

    return NextResponse.json({ reply: replyText, remaining });
  } catch (error) {
    console.error('API Error:', error);

    // Gemini無料枠のレート上限（1日あたりのリクエスト数）に達した場合は、
    // 初心者にも分かる言葉で「時間をおいて」と案内する（「サーバーログを確認してください」等の
    // 開発者向けメッセージを一般ユーザーに見せないようにする）
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isQuotaError =
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('429') ||
      errorMessage.toLowerCase().includes('quota');

    return NextResponse.json(
      {
        reply: isQuotaError
          ? '本日のAI利用回数の上限に達したようです🙏 しばらく時間をおいてから、もう一度お試しください。'
          : '通信エラーが発生しました。少し時間をおいてから、もう一度お試しください。',
        errorType: isQuotaError ? 'quota' : 'server',
      },
      { status: isQuotaError ? 429 : 500 }
    );
  }
}
