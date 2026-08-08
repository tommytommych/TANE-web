import { type SheetLayout, isValidSheetLayout } from './sheetLayout';
export type { SheetLayout } from './sheetLayout';
import { type AssemblyManual, isValidAssemblyManual } from './assemblyManual';
export type { AssemblyManual } from './assemblyManual';
import { type CameoDesignCandidate, isValidCameoDesignCandidate } from './cameoDesigns';
export type { CameoDesignCandidate } from './cameoDesigns';
import { type StudioSpec, isValidStudioSpec } from './studioSpec';
export type { StudioSpec } from './studioSpec';

export interface Message {
  role: string;
  content: string;
  image?: string;
  isError?: boolean; // AIからの返答取得に失敗した際の表示用（再送信ボタンを出す）
  retryText?: string; // isErrorがtrueの場合、再送信ボタンで送り直す元のテキスト
}

export interface CutPart {
  sizeMm: number;
  qty: number;
}

export interface MaterialGroup {
  name: string;
  boardLengthMm: number;
  parts: CutPart[];
}

// AIの回答末尾に付加される ```tanei-cutlist ... ``` ブロックを検出する正規表現
export const CUTLIST_BLOCK_REGEX = /```tanei-cutlist\s*([\s\S]*?)```/;

export const isValidMaterialGroup = (value: unknown): value is MaterialGroup => {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  if (typeof g.name !== 'string' || typeof g.boardLengthMm !== 'number' || !Array.isArray(g.parts)) {
    return false;
  }
  return g.parts.every(
    (p) =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).sizeMm === 'number' &&
      typeof (p as Record<string, unknown>).qty === 'number'
  );
};

// チャットの回答テキストから、AIが付加した木取り図データ（tanei-cutlistブロック）を取り出す
export const extractCutListFromContent = (content: string): MaterialGroup[] | null => {
  const match = content.match(CUTLIST_BLOCK_REGEX);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return null;
    const groups = parsed.filter(isValidMaterialGroup);
    return groups.length > 0 ? groups : null;
  } catch {
    return null;
  }
};

// AIの回答末尾に付加される ```tanei-sheetlayout ... ``` ブロックを検出する正規表現（合板等の2次元シート材用）
export const SHEETLAYOUT_BLOCK_REGEX = /```tanei-sheetlayout\s*([\s\S]*?)```/;

// チャットの回答テキストから、AIが付加したシート材木取りデータ（tanei-sheetlayoutブロック）を取り出す
export const extractSheetLayoutFromContent = (content: string): SheetLayout[] | null => {
  const match = content.match(SHEETLAYOUT_BLOCK_REGEX);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return null;
    const layouts = parsed.filter(isValidSheetLayout);
    return layouts.length > 0 ? layouts : null;
  } catch {
    return null;
  }
};

// 木取り図データ（角材・シート材）を「保存」機能に記録するための読みやすいテキストに変換する
export const formatCutListSummary = (materialGroups: MaterialGroup[], sheetLayouts: SheetLayout[]): string => {
  const lines: string[] = [];
  materialGroups.forEach((group) => {
    lines.push(`■ ${group.name}`);
    group.parts.forEach((part) => lines.push(`　・${part.sizeMm}mm × ${part.qty}本`));
  });
  sheetLayouts.forEach((layout) => {
    lines.push(`■ ${layout.name}（${layout.sheetWidthMm}×${layout.sheetHeightMm}mm）`);
    layout.parts.forEach((part) =>
      lines.push(`　・${part.widthMm}×${part.heightMm}mm × ${part.qty}枚${part.label ? `（${part.label}）` : ''}`)
    );
  });
  return lines.join('\n');
};

// AIの回答末尾に付加される ```tanei-assembly ... ``` ブロックを検出する正規表現（組立説明書用）
export const ASSEMBLY_BLOCK_REGEX = /```tanei-assembly\s*([\s\S]*?)```/;

// チャットの回答テキストから、AIが付加した組立説明書データ（tanei-assemblyブロック）を取り出す
export const extractAssemblyManualFromContent = (content: string): AssemblyManual | null => {
  const match = content.match(ASSEMBLY_BLOCK_REGEX);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    return isValidAssemblyManual(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// AIの回答末尾に付加される ```tanei-cameo-designs ... ``` ブロックを検出する正規表現（シルエットカメオのデザイン候補用）
export const CAMEO_DESIGNS_BLOCK_REGEX = /```tanei-cameo-designs\s*([\s\S]*?)```/;

// チャットの回答テキストから、AIが提案したカメオデザイン候補（tanei-cameo-designsブロック）を取り出す
export const extractCameoDesignsFromContent = (content: string): CameoDesignCandidate[] | null => {
  const match = content.match(CAMEO_DESIGNS_BLOCK_REGEX);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return null;
    const designs = parsed.filter(isValidCameoDesignCandidate).slice(0, 3);
    return designs.length > 0 ? designs : null;
  } catch {
    return null;
  }
};

// AIの回答末尾に付加される ```tanei-options ... ``` ブロックを検出する正規表現
export const OPTIONS_BLOCK_REGEX = /```tanei-options\s*([\s\S]*?)```/;

// チャットの回答テキストから、AIが提示した回答候補（tanei-optionsブロック）を取り出す
export const extractOptionsFromContent = (content: string): string[] | null => {
  const match = content.match(OPTIONS_BLOCK_REGEX);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return null;
    const options = parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return options.length > 0 ? options : null;
  } catch {
    return null;
  }
};

// 会話全体を通してAIが保持・更新する設計コンテキスト（作品名・サイズ・場所・予算・工具・経験・木材）
export interface DesignContext {
  item: string | null;
  size: string | null;
  place: string | null;
  budget: string | null;
  tools: string | null;
  experience: string | null;
  material: string | null;
}

const DESIGN_CONTEXT_KEYS: (keyof DesignContext)[] = [
  'item',
  'size',
  'place',
  'budget',
  'tools',
  'experience',
  'material',
];

export const isValidDesignContext = (value: unknown): value is DesignContext => {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return DESIGN_CONTEXT_KEYS.every((key) => c[key] === null || typeof c[key] === 'string');
};

// AIの回答末尾に付加される ```tanei-context ... ``` ブロックを検出する正規表現
export const CONTEXT_BLOCK_REGEX = /```tanei-context\s*([\s\S]*?)```/;

// チャットの回答テキストから、AIが更新した設計コンテキスト（tanei-contextブロック）を取り出す
export const extractContextFromContent = (content: string): DesignContext | null => {
  const match = content.match(CONTEXT_BLOCK_REGEX);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    return isValidDesignContext(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// AIの回答末尾に付加される ```tanei-studio-spec ... ``` ブロックを検出する正規表現
// （TANE:i Studio(freecad-studio/)への自動反映用の確定仕様）
export const STUDIO_SPEC_BLOCK_REGEX = /```tanei-studio-spec\s*([\s\S]*?)```/;

// チャットの回答テキストから、AIが付加したStudio連携用の確定仕様（tanei-studio-specブロック）を取り出す
export const extractStudioSpecFromContent = (content: string): StudioSpec | null => {
  const match = content.match(STUDIO_SPEC_BLOCK_REGEX);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(match[1].trim());
    return isValidStudioSpec(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// 表示用のMarkdown・APIへ送る会話履歴からは、内部データ用のtanei-*ブロックをすべて取り除く
export const stripInternalBlocks = (content: string): string =>
  content
    .replace(CUTLIST_BLOCK_REGEX, '')
    .replace(SHEETLAYOUT_BLOCK_REGEX, '')
    .replace(ASSEMBLY_BLOCK_REGEX, '')
    .replace(CAMEO_DESIGNS_BLOCK_REGEX, '')
    .replace(OPTIONS_BLOCK_REGEX, '')
    .replace(CONTEXT_BLOCK_REGEX, '')
    .replace(STUDIO_SPEC_BLOCK_REGEX, '')
    .trim();
