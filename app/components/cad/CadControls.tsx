'use client';

// 寸法・材質などの編集UI（Phase 1時点では読み取り専用の最小プレースホルダー）。
// 実際のスライダー・数値入力・パーツ追加操作はPhase 4「寸法・木材パーツ」で実装する。
// 今回は、CadStudio.tsxがFurnitureModelを受け取って表示側と連携できる、という
// データフローの土台だけを用意している。

import type { FurnitureModel } from '../../lib/cad/types';

interface CadControlsProps {
  model: FurnitureModel;
}

export default function CadControls({ model }: CadControlsProps) {
  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div>
        <span className="font-bold text-tanei-ink">{model.name}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-tanei-ink-muted">
        <dt>幅</dt>
        <dd>{model.width}mm</dd>
        <dt>奥行</dt>
        <dd>{model.depth}mm</dd>
        <dt>高さ</dt>
        <dd>{model.height}mm</dd>
        <dt>板厚</dt>
        <dd>{model.thickness}mm</dd>
        <dt>材質</dt>
        <dd>{model.material}</dd>
        <dt>パーツ数</dt>
        <dd>{model.panels.length}枚</dd>
      </dl>
      <p className="text-xs text-tanei-ink-muted">
        寸法編集・パーツ追加は今後実装予定です。
      </p>
    </div>
  );
}
