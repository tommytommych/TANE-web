'use client';

// 「パーツ」の一覧・追加UI。棚板の追加、背板・脚の有無の切り替え、
// 棚板一覧（タップで選択→下の「選択中」セクションで編集）を扱う。
// 専門用語（フィーチャーツリー等）を避け、DIY初心者が触ってすぐ分かる言葉にしている。

import type { FurnitureModel } from '../../lib/cad/types';

interface CadPartsPanelProps {
  model: FurnitureModel;
  backPanel: boolean;
  legs: boolean;
  selectedPanelId: string | null;
  onAddShelf: () => void;
  onToggleBackPanel: () => void;
  onToggleLegs: () => void;
  onSelectPanel: (panelId: string) => void;
}

export default function CadPartsPanel({
  model,
  backPanel,
  legs,
  selectedPanelId,
  onAddShelf,
  onToggleBackPanel,
  onToggleLegs,
  onSelectPanel,
}: CadPartsPanelProps) {
  const shelves = model.panels.filter((p) => p.kind === 'shelf');

  return (
    <div className="flex flex-col gap-3 p-4 pt-0 text-sm">
      <div className="border-t border-tanei-border pt-4">
        <span className="font-bold text-tanei-ink">パーツ</span>
      </div>

      <button
        type="button"
        onClick={onAddShelf}
        className="w-full bg-tanei-brand text-white px-4 py-2.5 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors"
      >
        ＋ 棚板を追加
      </button>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={backPanel} onChange={onToggleBackPanel} className="h-4 w-4 accent-tanei-brand" />
        <span className="text-tanei-ink">背板あり</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={legs} onChange={onToggleLegs} className="h-4 w-4 accent-tanei-brand" />
        <span className="text-tanei-ink">脚あり</span>
      </label>

      {shelves.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {shelves.map((shelf) => (
            <li key={shelf.id}>
              <button
                type="button"
                onClick={() => onSelectPanel(shelf.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-tanei-control border text-left transition-colors ${
                  shelf.id === selectedPanelId
                    ? 'bg-tanei-brand-soft border-tanei-brand text-tanei-ink'
                    : 'bg-tanei-surface hover:bg-white border-tanei-border text-tanei-ink'
                }`}
              >
                <span className="font-bold">{shelf.label}</span>
                <span className="text-tanei-ink-muted text-xs">{Math.round(shelf.position.z)}mm　編集</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
