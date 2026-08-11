'use client';

// ブラウザCADの最上位コンポーネント。「基本寸法」を変更すると、
// FurnitureDesign（寸法）→ Panels（自動計算） → 3D Geometry という流れで
// 3Dモデルをリアルタイムに再生成する（3Dモデルを直接ハードコードしない）。
// 初期モデルは「シンプルな木製棚」（幅750×奥行300×高さ900mm、板厚18mm、棚板2枚）。

import { useCallback, useMemo, useState } from 'react';
import CadViewport from './CadViewport';
import CadControls from './CadControls';
import { createShelfModel, DEFAULT_SHELF_DESIGN, type ShelfDesign } from '../../lib/cad/model';

interface CadStudioProps {
  initialDesign?: ShelfDesign;
}

export default function CadStudio({ initialDesign }: CadStudioProps) {
  const [design, setDesign] = useState<ShelfDesign>(initialDesign ?? DEFAULT_SHELF_DESIGN);

  const { model, errorMessage } = useMemo(() => {
    try {
      return { model: createShelfModel(design), errorMessage: null as string | null };
    } catch (error) {
      // 板厚に対して高さが小さすぎる等、生成できない寸法の組み合わせを入力中でも
      // アプリを落とさず、直前まで有効だったモデルは保持しつつエラー文だけ表示する
      const message = error instanceof Error ? error.message : '寸法の組み合わせが正しくありません。';
      return { model: null, errorMessage: message };
    }
  }, [design]);

  // 直前に有効だった3Dモデルを保持し、入力途中の一時的な不正値（例: 高さを消して
  // まだ何も入力していない一瞬）でビューアが空白にならないようにする
  const [lastValidModel, setLastValidModel] = useState(() => createShelfModel(design));
  if (model && model !== lastValidModel) {
    // レンダー中に直接更新することで、余分な再レンダーなしに「直前の有効なモデル」を
    // 常に最新化する（Reactが公式に認めているderived state更新パターンの一つ）
    setLastValidModel(model);
  }

  const handleDesignChange = useCallback((next: ShelfDesign) => {
    setDesign(next);
  }, []);

  return (
    <div className="flex h-full w-full flex-col sm:flex-row">
      <CadViewport model={lastValidModel} className="h-64 w-full sm:h-full sm:flex-1" />
      <div className="w-full border-t border-tanei-border sm:w-72 sm:border-l sm:border-t-0 sm:overflow-y-auto">
        <CadControls
          design={design}
          onChange={handleDesignChange}
          panelCount={lastValidModel.panels.length}
          errorMessage={errorMessage}
        />
      </div>
    </div>
  );
}
