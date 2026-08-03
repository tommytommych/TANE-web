import {
  type Message,
  type DesignContext,
  extractContextFromContent,
  extractCutListFromContent,
  extractSheetLayoutFromContent,
  extractAssemblyManualFromContent,
  isValidDesignContext,
} from './cutlist';

// プロジェクト全体の進行状況。各生成機能（木取り図・PDF・組立説明書）は、
// 必要な状態に達するまで実行できないようにするためのゲート判定に使う
export type ProjectStatus = 'Draft' | 'Interviewing' | 'DesignReady' | 'CutListReady' | 'PdfReady' | 'AssemblyReady';

export interface ProjectFlags {
  hasDesign: boolean; // 設計図生成済み（作品名・サイズ・場所・予算・経験の必須項目が揃った設計提案が出た）
  hasDimensions: boolean; // 寸法確定（この実装ではhasDesignに内包される：sizeは設計完了の必須項目のため）
  hasCutList: boolean; // カットリスト（木取り図データ）生成済み
  hasMaterials: boolean; // 材料一覧生成済み（この実装ではhasCutListに内包される：
  // tanei-cutlist/tanei-sheetlayoutには材質名・サイズ・数量が含まれ、それ自体が材料一覧を兼ねるため）
  hasPdf: boolean; // ①ホームセンター提出用PDFを生成済み
  hasAssembly: boolean; // ②組立説明書（データまたはPDF）を生成済み
}

const REQUIRED_CONTEXT_KEYS: (keyof DesignContext)[] = ['item', 'size', 'place', 'budget', 'experience'];

// tanei-contextの必須5項目（作品名・サイズ・場所・予算・経験）がすべて埋まっているかどうかを判定する。
// システムプロンプト側で「設計開始」の合図として使っているのと同じ基準
const isContextComplete = (content: string): boolean => {
  const context = extractContextFromContent(content);
  if (!context || !isValidDesignContext(context)) return false;
  return REQUIRED_CONTEXT_KEYS.every((key) => !!context[key]);
};

// 会話履歴と、PDF/組立説明書の生成実績（クライアント側でのみ分かる）から、現在のプロジェクト状態を導出する
export const deriveProjectFlags = (
  messages: Message[],
  hasGeneratedPdf: boolean,
  hasGeneratedAssembly: boolean
): ProjectFlags => {
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  const hasDesign = assistantMessages.some((m) => isContextComplete(m.content));
  const hasCutList = assistantMessages.some(
    (m) => !!extractCutListFromContent(m.content)?.length || !!extractSheetLayoutFromContent(m.content)?.length
  );
  const hasAssemblyData = assistantMessages.some((m) => !!extractAssemblyManualFromContent(m.content));

  return {
    hasDesign,
    hasDimensions: hasDesign,
    hasCutList,
    hasMaterials: hasCutList,
    hasPdf: hasGeneratedPdf,
    hasAssembly: hasGeneratedAssembly || hasAssemblyData,
  };
};

// フラグから、最も進んだ状態を1つのProjectStatusとして表す（進捗表示などに使える）
export const deriveProjectStatus = (flags: ProjectFlags, hasStarted: boolean): ProjectStatus => {
  if (flags.hasAssembly) return 'AssemblyReady';
  if (flags.hasPdf) return 'PdfReady';
  if (flags.hasCutList) return 'CutListReady';
  if (flags.hasDesign) return 'DesignReady';
  if (hasStarted) return 'Interviewing';
  return 'Draft';
};

export interface GateResult {
  allowed: boolean;
  missing: string[];
}

// ■木取り図 必要条件：設計図生成済み・寸法確定
export const canGenerateCutList = (flags: ProjectFlags): GateResult => {
  if (!flags.hasDesign || !flags.hasDimensions) {
    return { allowed: false, missing: ['設計図の作成（サイズの確定を含む）'] };
  }
  return { allowed: true, missing: [] };
};

// ■PDF 必要条件：設計図・木取り図・材料一覧
export const canGeneratePdf = (flags: ProjectFlags): GateResult => {
  const missing: string[] = [];
  if (!flags.hasDesign) missing.push('設計図の作成');
  if (!flags.hasCutList || !flags.hasMaterials) missing.push('木取り図（材料一覧を含む）の作成');
  return { allowed: missing.length === 0, missing };
};

// ■組立説明書 必要条件：設計図生成済み・材料一覧生成済み・カットリスト生成済み
export const canGenerateAssembly = (flags: ProjectFlags): GateResult => {
  const missing: string[] = [];
  if (!flags.hasDesign) missing.push('設計図の作成');
  if (!flags.hasCutList || !flags.hasMaterials) missing.push('木取り図・カットリスト（材料一覧を含む）の作成');
  return { allowed: missing.length === 0, missing };
};
