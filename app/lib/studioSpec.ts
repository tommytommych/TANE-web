// TANE:i Studio（FreeCAD+POV-Rayによる木工設計スタジオ、freecad-studio/）と
// チャットとの双方向同期に使う、確定仕様（品名・寸法・材質・パーツごとの塗装）の型定義

import type { SheetLayout } from './sheetLayout';

export type PanelFinish = 'clear' | 'walnut' | 'white' | 'black';

export interface StudioSpec {
  item: string;
  width: number;
  depth: number;
  height: number;
  thickness?: number;
  material: string;
  panelFinishes?: Partial<Record<'天板' | '底板' | '側板' | '背板', PanelFinish>>;
}

const PANEL_LABELS = ['天板', '底板', '側板', '背板'];
const PANEL_FINISHES: PanelFinish[] = ['clear', 'walnut', 'white', 'black'];

const isValidPanelFinishes = (value: unknown): value is StudioSpec['panelFinishes'] => {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([label, finish]) => PANEL_LABELS.includes(label) && PANEL_FINISHES.includes(finish as PanelFinish)
  );
};

export const isValidStudioSpec = (value: unknown): value is StudioSpec => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.item === 'string' &&
    typeof v.width === 'number' &&
    typeof v.depth === 'number' &&
    typeof v.height === 'number' &&
    (v.thickness === undefined || typeof v.thickness === 'number') &&
    typeof v.material === 'string' &&
    isValidPanelFinishes(v.panelFinishes)
  );
};

// 国内のホームセンターで一般的な合板・集成材の規格サイズ（3×6版、910×1820mm）を
// 標準の元板として想定する
const DEFAULT_SHEET_WIDTH_MM = 910;
const DEFAULT_SHEET_HEIGHT_MM = 1820;
const DEFAULT_THICKNESS_MM = 18;

// 設計スタジオの確定仕様（天板・底板・側板・背板からなる箱型家具の外寸）から、
// カット申込書PDF（buildUniversalCutSheetPdf）が受け取れる2次元木取り図データを組み立てる。
// 天板・底板は外寸そのまま、側板は天板・底板の間、背板はさらに側板の内側に収まる前提の
// 簡易的な箱組み構成で近似しており、実際の組み方によって多少の誤差は出ることを想定している
// （PDF側にも「実際の誤差は店舗の機械により異なります」旨の注記が入っている）
export const studioSpecToSheetLayout = (spec: StudioSpec): SheetLayout => {
  const t = spec.thickness ?? DEFAULT_THICKNESS_MM;
  const clamp = (n: number) => Math.max(20, Math.round(n));

  return {
    name: `${spec.material}（${t}mm厚）`,
    sheetWidthMm: DEFAULT_SHEET_WIDTH_MM,
    sheetHeightMm: DEFAULT_SHEET_HEIGHT_MM,
    parts: [
      { widthMm: clamp(spec.width), heightMm: clamp(spec.depth), qty: 1, label: '天板' },
      { widthMm: clamp(spec.width), heightMm: clamp(spec.depth), qty: 1, label: '底板' },
      { widthMm: clamp(spec.depth), heightMm: clamp(spec.height - 2 * t), qty: 2, label: '側板' },
      { widthMm: clamp(spec.width - 2 * t), heightMm: clamp(spec.height - 2 * t), qty: 1, label: '背板' },
    ],
  };
};
