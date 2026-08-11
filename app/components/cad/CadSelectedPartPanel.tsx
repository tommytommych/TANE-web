'use client';

// 「選択中」セクション。3Dビューまたはパーツ一覧で選んだパネルの詳細を表示する。
// 棚板は高さ・幅・奥行きを編集でき、削除もできる。天板・底板・側板・背板・脚は
// 今回まだ個別編集の対象外のため、どのパーツかが分かる情報だけを表示する
// （「選択状態が分かるようにする」という要件を、編集可否によらず全パーツで満たす）。

import type { FurnitureDesign, FurniturePanel } from '../../lib/cad/types';
import { defaultShelfSize, panelToCutSizeMm } from '../../lib/cad/geometry';

interface CadSelectedPartPanelProps {
  design: FurnitureDesign;
  selectedPanel: FurniturePanel | null;
  onUpdateShelf: (patch: { zAtMm?: number; widthMm?: number; depthMm?: number }) => void;
  onRemoveShelf: () => void;
  onDeselect: () => void;
}

export default function CadSelectedPartPanel({
  design,
  selectedPanel,
  onUpdateShelf,
  onRemoveShelf,
  onDeselect,
}: CadSelectedPartPanelProps) {
  if (!selectedPanel) return null;

  const isShelf = selectedPanel.kind === 'shelf';
  const t = design.thickness;
  const { widthMm: maxWidth, depthMm: maxDepth } = defaultShelfSize(design);

  return (
    <div className="flex flex-col gap-3 p-4 pt-0 text-sm">
      <div className="border-t border-tanei-border pt-4 flex items-center justify-between">
        <span className="font-bold text-tanei-ink">選択中：{selectedPanel.label}</span>
        <button type="button" onClick={onDeselect} className="text-xs text-tanei-ink-muted hover:text-tanei-brand underline">
          選択解除
        </button>
      </div>

      {isShelf ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-tanei-ink-muted">高さ（mm）</span>
              <input
                type="number"
                inputMode="numeric"
                value={Math.round(selectedPanel.position.z)}
                min={t}
                max={design.height - t}
                onChange={(e) => onUpdateShelf({ zAtMm: Number(e.target.value) })}
                className="border border-tanei-border rounded-tanei-control px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-tanei-ink-muted">幅（mm）</span>
              <input
                type="number"
                inputMode="numeric"
                value={Math.round(selectedPanel.size.x)}
                min={50}
                max={maxWidth}
                onChange={(e) => onUpdateShelf({ widthMm: Number(e.target.value) })}
                className="border border-tanei-border rounded-tanei-control px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-tanei-ink-muted">奥行（mm）</span>
              <input
                type="number"
                inputMode="numeric"
                value={Math.round(selectedPanel.size.y)}
                min={50}
                max={maxDepth}
                onChange={(e) => onUpdateShelf({ depthMm: Number(e.target.value) })}
                className="border border-tanei-border rounded-tanei-control px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand"
              />
            </label>
          </div>
          <p className="text-xs text-tanei-ink-muted">
            側板・天板・底板を突き抜けない範囲に自動で収まります。
          </p>
          <button
            type="button"
            onClick={onRemoveShelf}
            className="w-full bg-white border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-tanei-control text-sm font-bold transition-colors"
          >
            この棚板を削除
          </button>
        </>
      ) : (
        <p className="text-xs text-tanei-ink-muted">
          板のサイズ: {panelToCutSizeMm(selectedPanel).widthMm} × {panelToCutSizeMm(selectedPanel).heightMm}mm
          （厚み{Math.round(Math.min(selectedPanel.size.x, selectedPanel.size.y, selectedPanel.size.z))}mm）
          <br />
          このパーツは家具全体のサイズ変更に応じて自動的に調整されます。
        </p>
      )}
    </div>
  );
}
