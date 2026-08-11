'use client';

// ブラウザCADの最上位コンポーネント（Phase 1時点の土台）。
// まだどのルートにも組み込んでいない（既存UIに影響を与えないため）。Phase 2以降で
// 専用ページ（例: app/app/cad/page.tsx）を新設し、ここから組み込む想定。
//
// CadViewport（3D表示）とCadControls（寸法等の表示）の両方が、同じFurnitureModelを
// 参照するだけで動くことを確認するための最小構成。モデルを渡さない場合は
// createFurnitureModel()でデモ用の箱を1つ生成して表示する。

import { useMemo } from 'react';
import CadViewport from './CadViewport';
import CadControls from './CadControls';
import { createFurnitureModel } from '../../lib/cad/model';
import type { FurnitureModel } from '../../lib/cad/types';

interface CadStudioProps {
  model?: FurnitureModel;
}

export default function CadStudio({ model }: CadStudioProps) {
  const resolvedModel = useMemo(
    () =>
      model ??
      createFurnitureModel({
        projectId: 'demo',
        name: 'テレビ台（サンプル）',
        width: 1200,
        depth: 400,
        height: 400,
      }),
    [model]
  );

  return (
    <div className="flex h-full w-full flex-col sm:flex-row">
      <CadViewport model={resolvedModel} className="h-64 w-full sm:h-full sm:flex-1" />
      <div className="w-full border-t border-tanei-border sm:w-72 sm:border-l sm:border-t-0">
        <CadControls model={resolvedModel} />
      </div>
    </div>
  );
}
