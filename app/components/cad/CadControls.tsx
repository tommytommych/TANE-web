'use client';

// 「基本寸法」の編集UI。専門的なCAD用語（拘束・フィーチャー・押し出し等）は使わず、
// 幅・奥行・高さ・板厚という初心者にも分かる言葉だけで寸法を変更できるようにする。
// 数値を変更すると、呼び出し元（CadStudio.tsx）がFurnitureModelを再生成し、
// 3Dモデルへリアルタイムに反映される。

import type { ShelfDesign } from '../../lib/cad/model';
import { MAX_DIMENSION_MM, MAX_THICKNESS_MM, MIN_DIMENSION_MM, MIN_THICKNESS_MM } from '../../lib/cad/model';

interface CadControlsProps {
  design: ShelfDesign;
  onChange: (next: ShelfDesign) => void;
  panelCount: number;
  errorMessage?: string | null;
}

const FIELDS: { key: keyof ShelfDesign; label: string; min: number; max: number }[] = [
  { key: 'width', label: '幅', min: MIN_DIMENSION_MM, max: MAX_DIMENSION_MM },
  { key: 'depth', label: '奥行', min: MIN_DIMENSION_MM, max: MAX_DIMENSION_MM },
  { key: 'height', label: '高さ', min: MIN_DIMENSION_MM, max: MAX_DIMENSION_MM },
  { key: 'thickness', label: '板厚', min: MIN_THICKNESS_MM, max: MAX_THICKNESS_MM },
];

export default function CadControls({ design, onChange, panelCount, errorMessage }: CadControlsProps) {
  const handleFieldChange = (key: keyof ShelfDesign, rawValue: string) => {
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    onChange({ ...design, [key]: value });
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div>
        <span className="font-bold text-tanei-ink">基本寸法</span>
        <p className="text-xs text-tanei-ink-muted mt-0.5">数値を変えると3Dモデルにすぐ反映されます</p>
      </div>

      <div className="flex flex-col gap-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-xs font-bold text-tanei-ink-muted">
              {field.label}（mm）
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={design[field.key]}
              min={field.min}
              max={field.max}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="border border-tanei-border rounded-tanei-control px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand"
            />
          </label>
        ))}
      </div>

      {errorMessage ? (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-tanei-control px-3 py-2">
          {errorMessage}
        </p>
      ) : (
        <p className="text-xs text-tanei-ink-muted">
          天板・底板・側板・背板・棚板の合計{panelCount}枚で構成されています。
        </p>
      )}
    </div>
  );
}
