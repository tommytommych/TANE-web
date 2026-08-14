'use client';

// 「見た目」（色・仕上げ）の選択UI（Phase B）。パーツごとの材料選択（木取り図画面の
// 「パーツごとに材料を分ける」）と同じ考え方で、家具に実際に登場するパーツ種類だけを
// 一覧し、それぞれ任意で色・仕上げを上書きできるようにする。木取り図・カットリストの
// 計算には影響しない（色は3D表示・完成イメージだけに反映される表示専用の情報のため）。

import type { FurnitureModel } from '../../lib/cad/types';
import { CUT_LIST_KIND_NAME, FURNITURE_FINISHES, type PartMaterialLabel } from '../../lib/cad/model';
import type { PanelFinish } from '../../lib/cad/types';

interface CadAppearancePanelProps {
  model: FurnitureModel;
  partFinishes: Partial<Record<PartMaterialLabel, PanelFinish>>;
  onPartFinishChange: (label: PartMaterialLabel, value: PanelFinish | '') => void;
}

export default function CadAppearancePanel({ model, partFinishes, onPartFinishChange }: CadAppearancePanelProps) {
  // 実在するパーツ種類（天板・脚・幕板等）だけを、登場順で重複無く列挙する
  // （CadCutlistView.tsxのavailablePartLabelsと全く同じ考え方）
  const availablePartLabels: PartMaterialLabel[] = [];
  model.panels.forEach((panel) => {
    const label = CUT_LIST_KIND_NAME[panel.kind] as PartMaterialLabel | undefined;
    if (label && !availablePartLabels.includes(label)) availablePartLabels.push(label);
  });

  if (availablePartLabels.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 text-sm">
      <div className="border-t border-tanei-border pt-4">
        <span className="font-bold text-tanei-ink">見た目（色・仕上げ）</span>
        <p className="text-xs text-tanei-ink-muted mt-0.5">
          パーツごとに色・仕上げを変更できます（任意。指定しなければ材料そのままの色になります）
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {availablePartLabels.map((label) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="text-xs font-bold text-tanei-ink-muted">{label}</span>
            <select
              value={partFinishes[label] ?? ''}
              onChange={(e) => onPartFinishChange(label, e.target.value as PanelFinish | '')}
              className="border border-tanei-border rounded-tanei-control px-2 py-1.5 text-xs text-tanei-ink font-bold bg-white focus:outline-none focus:ring-2 focus:ring-tanei-brand"
            >
              <option value="">クリア塗装（材質の木目）</option>
              {FURNITURE_FINISHES.filter((f) => f.value !== 'clear').map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
