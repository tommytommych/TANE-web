'use client';

// 「パーツ」の一覧・追加UI。棚板の追加、背板・脚の有無の切り替え、
// 棚板一覧（タップで選択→下の「選択中」セクションで編集）を扱う。
// 専門用語（フィーチャーツリー等）を避け、DIY初心者が触ってすぐ分かる言葉にしている。

import type { FurnitureModel } from '../../lib/cad/types';
import { MAX_DRAWER_COUNT } from '../../lib/cad/model';
import { MAX_LEG_HEIGHT_MM, MIN_LEG_HEIGHT_MM } from '../../lib/cad/geometry';

interface CadPartsPanelProps {
  model: FurnitureModel;
  backPanel: boolean;
  legs: boolean;
  legHeightMm: number;
  legCount: 4 | 6;
  doors: boolean;
  doorCount: 1 | 2;
  drawerCount: number;
  /** 家具の構造の種類。'table'のときは棚板・背板・脚・扉・引き出しの切り替えUIを表示しない
   * （テーブルは天板+脚+幕板という固定構成のため）。省略時は既存どおり箱型として扱う */
  kind?: 'box' | 'table';
  selectedPanelId: string | null;
  onAddShelf: () => void;
  onToggleBackPanel: () => void;
  onToggleLegs: () => void;
  onLegHeightChange: (heightMm: number) => void;
  onLegCountChange: (count: 4 | 6) => void;
  onToggleDoors: () => void;
  onDoorCountChange: (count: 1 | 2) => void;
  onIncrementDrawerCount: () => void;
  onDecrementDrawerCount: () => void;
  onSelectPanel: (panelId: string) => void;
}

export default function CadPartsPanel({
  model,
  backPanel,
  legs,
  legHeightMm,
  legCount,
  doors,
  doorCount,
  drawerCount,
  kind,
  selectedPanelId,
  onAddShelf,
  onToggleBackPanel,
  onToggleLegs,
  onLegHeightChange,
  onLegCountChange,
  onToggleDoors,
  onDoorCountChange,
  onIncrementDrawerCount,
  onDecrementDrawerCount,
  onSelectPanel,
}: CadPartsPanelProps) {
  const shelves = model.panels.filter((p) => p.kind === 'shelf');
  const isTable = kind === 'table';

  return (
    <div className="flex flex-col gap-3 p-4 pt-0 text-sm">
      <div className="border-t border-tanei-border pt-4">
        <span className="font-bold text-tanei-ink">パーツ</span>
      </div>

      {isTable ? (
        <p className="text-xs text-tanei-ink-muted">
          テーブルは天板・脚・幕板で構成されています。
        </p>
      ) : (
        <>
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

          {legs && (
            <div className="flex flex-col gap-2 pl-6 -mt-1">
              <label className="flex items-center justify-between gap-2">
                <span className="text-xs text-tanei-ink-muted">脚の高さ（mm）</span>
                <input
                  type="number"
                  min={MIN_LEG_HEIGHT_MM}
                  max={MAX_LEG_HEIGHT_MM}
                  value={legHeightMm}
                  onChange={(e) => onLegHeightChange(Number(e.target.value))}
                  className="w-20 border border-tanei-border rounded-tanei-control px-2 py-1 text-xs text-tanei-ink font-bold bg-white focus:outline-none focus:ring-2 focus:ring-tanei-brand"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-tanei-ink-muted">脚の本数</span>
                <div className="flex gap-1.5">
                  {([4, 6] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onLegCountChange(count)}
                      className={`px-3 py-1 rounded-tanei-control text-xs font-bold border transition-colors ${
                        legCount === count
                          ? 'bg-tanei-brand-soft border-tanei-brand text-tanei-ink'
                          : 'bg-tanei-surface hover:bg-white border-tanei-border text-tanei-ink'
                      }`}
                    >
                      {count}本
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={doors} onChange={onToggleDoors} className="h-4 w-4 accent-tanei-brand" />
            <span className="text-tanei-ink">扉あり</span>
          </label>

          {doors && (
            <div className="flex items-center justify-between gap-2 pl-6 -mt-1">
              <span className="text-xs text-tanei-ink-muted">扉の枚数</span>
              <div className="flex gap-1.5">
                {([1, 2] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onDoorCountChange(count)}
                    className={`px-3 py-1 rounded-tanei-control text-xs font-bold border transition-colors ${
                      doorCount === count
                        ? 'bg-tanei-brand-soft border-tanei-brand text-tanei-ink'
                        : 'bg-tanei-surface hover:bg-white border-tanei-border text-tanei-ink'
                    }`}
                  >
                    {count}枚
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-tanei-ink">引き出し</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDecrementDrawerCount}
                disabled={drawerCount <= 0}
                aria-label="引き出しを減らす"
                className="h-7 w-7 flex items-center justify-center rounded-tanei-control border border-tanei-border bg-tanei-surface hover:bg-white text-tanei-ink font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                −
              </button>
              <span className="w-6 text-center font-bold text-tanei-ink">{drawerCount}</span>
              <button
                type="button"
                onClick={onIncrementDrawerCount}
                disabled={drawerCount >= MAX_DRAWER_COUNT}
                aria-label="引き出しを増やす"
                className="h-7 w-7 flex items-center justify-center rounded-tanei-control border border-tanei-border bg-tanei-surface hover:bg-white text-tanei-ink font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ＋
              </button>
            </div>
          </div>
        </>
      )}

      {!isTable && shelves.length > 0 && (
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
