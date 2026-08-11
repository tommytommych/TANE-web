'use client';

// 「家具のサイズ」の編集UI。専門的なCAD用語（拘束・フィーチャー・押し出し等）は使わず、
// 幅・奥行・高さ・板厚という初心者にも分かる言葉だけで寸法を変更できるようにする。
// 数値を変更すると、呼び出し元（CadStudio.tsx）がFurnitureDesignを再計算し、
// 3Dモデルへリアルタイムに反映される。

import type { FurnitureDesign } from '../../lib/cad/types';
import { MAX_DIMENSION_MM, MAX_THICKNESS_MM, MIN_DIMENSION_MM, MIN_THICKNESS_MM } from '../../lib/cad/model';

interface CadControlsProps {
  design: FurnitureDesign;
  onDimensionChange: (patch: Partial<Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness'>>) => void;
  errorMessage?: string | null;
}

const FIELDS: { key: 'width' | 'depth' | 'height' | 'thickness'; label: string; min: number; max: number }[] = [
  { key: 'width', label: '幅', min: MIN_DIMENSION_MM, max: MAX_DIMENSION_MM },
  { key: 'depth', label: '奥行', min: MIN_DIMENSION_MM, max: MAX_DIMENSION_MM },
  { key: 'height', label: '高さ', min: MIN_DIMENSION_MM, max: MAX_DIMENSION_MM },
  { key: 'thickness', label: '板厚', min: MIN_THICKNESS_MM, max: MAX_THICKNESS_MM },
];

export default function CadControls({ design, onDimensionChange, errorMessage }: CadControlsProps) {
  const handleFieldChange = (key: (typeof FIELDS)[number]['key'], rawValue: string) => {
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    onDimensionChange({ [key]: value });
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div>
        <span className="font-bold text-tanei-ink">家具のサイズ</span>
        <p className="text-xs text-tanei-ink-muted mt-0.5">数値を変えると3Dモデルにすぐ反映されます</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-xs font-bold text-tanei-ink-muted">{field.label}（mm）</span>
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

      {errorMessage && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-tanei-control px-3 py-2">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
