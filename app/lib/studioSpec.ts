// TANE:i Studio（FreeCAD+POV-Rayによる木工設計スタジオ、freecad-studio/）と
// チャットとの双方向同期に使う、確定仕様（品名・寸法・材質・パーツごとの塗装）の型定義

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
