'use client';

// ブラウザCADの最上位コンポーネント。「家具のサイズ」変更に加え、棚板の追加・削除・
// 編集、背板・脚のON/OFFができる（Phase 2-2）。3Dオブジェクトそのものを状態の中心に
// せず、常にFurnitureDesign（状態）→ FurnitureModel.panels（buildFurnitureModelで
// 毎回再計算） → 3D表示、というデータ駆動の流れを維持している。

import { useCallback, useMemo, useState } from 'react';
import CadViewport from './CadViewport';
import CadControls from './CadControls';
import CadPartsPanel from './CadPartsPanel';
import CadSelectedPartPanel from './CadSelectedPartPanel';
import {
  addShelfToDesign,
  buildFurnitureModel,
  createDefaultFurnitureDesign,
  removeShelfFromDesign,
  resizeFurnitureDesign,
  setBackPanel,
  setLegs,
  updateShelfInDesign,
} from '../../lib/cad/model';
import type { FurnitureDesign } from '../../lib/cad/types';

interface CadStudioProps {
  initialDesign?: FurnitureDesign;
}

export default function CadStudio({ initialDesign }: CadStudioProps) {
  const [design, setDesign] = useState<FurnitureDesign>(initialDesign ?? createDefaultFurnitureDesign());
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  const { model, errorMessage } = useMemo(() => {
    try {
      return { model: buildFurnitureModel(design), errorMessage: null as string | null };
    } catch (error) {
      // 板厚に対して高さが小さすぎる等、生成できない寸法の組み合わせを入力中でも
      // アプリを落とさず、直前まで有効だったモデルは保持しつつエラー文だけ表示する
      const message = error instanceof Error ? error.message : '寸法の組み合わせが正しくありません。';
      return { model: null, errorMessage: message };
    }
  }, [design]);

  // 直前に有効だった3Dモデルを保持し、入力途中の一時的な不正値（例: 高さを消して
  // まだ何も入力していない一瞬）でビューアが空白にならないようにする
  const [lastValidModel, setLastValidModel] = useState(() => buildFurnitureModel(design));
  if (model && model !== lastValidModel) {
    // レンダー中に直接更新することで、余分な再レンダーなしに「直前の有効なモデル」を
    // 常に最新化する（Reactが公式に認めているderived state更新パターンの一つ）
    setLastValidModel(model);
  }

  const selectedPanel = useMemo(
    () => lastValidModel.panels.find((p) => p.id === selectedPanelId) ?? null,
    [lastValidModel, selectedPanelId]
  );

  const handleDimensionChange = useCallback(
    (patch: Partial<Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness'>>) => {
      setDesign((prev) => resizeFurnitureDesign(prev, patch));
    },
    []
  );

  const handleAddShelf = useCallback(() => {
    setDesign((prev) => addShelfToDesign(prev));
  }, []);

  const handleToggleBackPanel = useCallback(() => {
    setDesign((prev) => setBackPanel(prev, !prev.backPanel));
  }, []);

  const handleToggleLegs = useCallback(() => {
    setDesign((prev) => setLegs(prev, !prev.legs));
  }, []);

  const handleUpdateShelf = useCallback(
    (patch: { zAtMm?: number; widthMm?: number; depthMm?: number }) => {
      if (!selectedPanelId) return;
      setDesign((prev) => updateShelfInDesign(prev, selectedPanelId, patch));
    },
    [selectedPanelId]
  );

  const handleRemoveShelf = useCallback(() => {
    if (!selectedPanelId) return;
    setDesign((prev) => removeShelfFromDesign(prev, selectedPanelId));
    setSelectedPanelId(null);
  }, [selectedPanelId]);

  const handleSelectPanel = useCallback((panelId: string | null) => {
    setSelectedPanelId(panelId);
  }, []);

  return (
    <div className="flex h-full w-full flex-col sm:flex-row">
      <CadViewport
        model={lastValidModel}
        className="h-64 w-full flex-shrink-0 sm:h-full sm:flex-1"
        selectedPanelId={selectedPanelId}
        onSelectPanel={handleSelectPanel}
      />
      <div className="w-full min-h-0 border-t border-tanei-border sm:w-80 sm:border-l sm:border-t-0 sm:overflow-y-auto">
        <CadControls design={design} onDimensionChange={handleDimensionChange} errorMessage={errorMessage} />
        <CadPartsPanel
          model={lastValidModel}
          backPanel={design.backPanel}
          legs={design.legs}
          selectedPanelId={selectedPanelId}
          onAddShelf={handleAddShelf}
          onToggleBackPanel={handleToggleBackPanel}
          onToggleLegs={handleToggleLegs}
          onSelectPanel={handleSelectPanel}
        />
        <CadSelectedPartPanel
          design={design}
          selectedPanel={selectedPanel}
          onUpdateShelf={handleUpdateShelf}
          onRemoveShelf={handleRemoveShelf}
          onDeselect={() => handleSelectPanel(null)}
        />
      </div>
    </div>
  );
}
