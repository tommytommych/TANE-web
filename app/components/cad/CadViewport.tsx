'use client';

// ブラウザCADの3Dビューア。FurnitureModelのpanelsをBoxGeometryとして描画し、
// タップ・クリックでパーツを選択できる（スマホでもR3Fのポインターイベントが
// タッチを同様に扱うため、追加の分岐は不要）。
// tanei-studio/static/index.htmlの素のThree.js実装（カメラ・ライティングの考え方）を
// React Three Fiberへ移植した構成。FreeCAD版と違いネイティブアプリ・サーバーに
// 一切依存せず、ブラウザだけで完結する。

import { useMemo, useRef } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { FurnitureModel } from '../../lib/cad/types';
import { furnitureModelToViewerPanels } from '../../lib/cad/model';

interface CadViewportProps {
  model: FurnitureModel;
  className?: string;
  selectedPanelId: string | null;
  onSelectPanel: (panelId: string | null) => void;
}

// mm単位の座標をThree.jsのシーン単位（メートル相当）へ縮小する。
// 家具サイズ（数百〜数千mm）をそのままThree.js空間に置くとカメラ・ライトの
// 既定値と桁が合わないため、1/1000して扱いやすいスケールに揃える
const MM_TO_SCENE = 1 / 1000;

function PanelMesh({
  panel,
  isSelected,
  onSelect,
}: {
  panel: ReturnType<typeof furnitureModelToViewerPanels>[number];
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const { x, y, z, dx, dy, dz, color, id } = panel;
  // tanei-studioの座標系（原点=本体の左手前下、y=奥行方向で背板側が大きい値）を、
  // Three.jsの座標系（X=幅, Y=高さ, Z=奥行）へ変換するため、パネル位置にサイズの
  // 半分を足して「箱の中心座標」にしている
  const position: [number, number, number] = [
    (x + dx / 2) * MM_TO_SCENE,
    (z + dz / 2) * MM_TO_SCENE,
    (y + dy / 2) * MM_TO_SCENE,
  ];
  const size: [number, number, number] = [dx * MM_TO_SCENE, dz * MM_TO_SCENE, dy * MM_TO_SCENE];

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    // 手前のパネルだけを選択する（クリック位置の奥にある他パネルまで連鎖して
    // 反応しないようにする。R3Fの既定ではraycast命中順に全てへイベントが伝播するため）
    event.stopPropagation();
    onSelect(id);
  };

  return (
    <mesh position={position} name={panel.label} onClick={handleClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        emissive={isSelected ? '#5F8D69' : '#000000'}
        emissiveIntensity={isSelected ? 0.45 : 0}
      />
    </mesh>
  );
}

export default function CadViewport({ model, className, selectedPanelId, onSelectPanel }: CadViewportProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const panels = useMemo(() => furnitureModelToViewerPanels(model), [model]);
  const selectedLabel = panels.find((p) => p.id === selectedPanelId)?.label ?? null;

  // モデルの中心座標とおおよそのカメラ距離（最大寸法に応じて後方へ引く。
  // 厳密なフィッティングが必要になればPhase 2-3以降で調整する）
  const center: [number, number, number] = [
    (model.width / 2) * MM_TO_SCENE,
    (model.height / 2) * MM_TO_SCENE,
    (model.depth / 2) * MM_TO_SCENE,
  ];
  const maxDimMm = Math.max(model.width, model.depth, model.height, 1);
  const distance = maxDimMm * MM_TO_SCENE * 1.8;

  const setView = (mode: 'front' | 'oblique') => {
    const controls = controlsRef.current;
    if (!controls) return;
    const [cx, cy, cz] = center;
    if (mode === 'front') {
      // モデルのZ座標は奥行方向（tanei-studio座標系のy）に対応し、Z=0側が手前＝正面、
      // Zが大きいほど背板側＝背面になる（PanelMeshのposition変換を参照）。
      // カメラを正面側（Zが小さい側）に置いてモデル中心を見ることで、正しく正面が映る
      controls.object.position.set(cx, cy, cz - distance);
    } else {
      controls.object.position.set(cx + distance, cy + distance * 0.8, cz + distance);
    }
    controls.target.set(cx, cy, cz);
    controls.update();
  };

  return (
    <div className={`relative ${className ?? 'h-full w-full'}`}>
      {/* 初心者向けのカメラプリセット。OrbitControlsでも同じ視点に手動で回せるが、
          「正面」「斜め」というボタンにしておくと、3D操作に不慣れな人でも迷わない */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <button
          type="button"
          onClick={() => setView('front')}
          className="bg-white/90 hover:bg-white text-tanei-ink text-xs font-bold px-3 py-1.5 rounded-full border border-tanei-border shadow-sm transition-colors"
        >
          正面から見る
        </button>
        <button
          type="button"
          onClick={() => setView('oblique')}
          className="bg-white/90 hover:bg-white text-tanei-ink text-xs font-bold px-3 py-1.5 rounded-full border border-tanei-border shadow-sm transition-colors"
        >
          斜めから見る
        </button>
      </div>

      {selectedLabel && (
        <div className="absolute top-3 right-3 z-10 bg-tanei-brand text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
          {selectedLabel}を選択中
        </div>
      )}

      <Canvas
        camera={{ position: [center[0] + distance, center[1] + distance * 0.8, center[2] + distance], fov: 45 }}
        style={{ touchAction: 'none' }}
        onPointerMissed={() => onSelectPanel(null)}
      >
        <color attach="background" args={['#FAF8F4']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 2]} intensity={0.8} />
        {panels.map((panel) => (
          <PanelMesh key={panel.id} panel={panel} isSelected={panel.id === selectedPanelId} onSelect={onSelectPanel} />
        ))}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={center}
          enableDamping
          dampingFactor={0.15}
          minDistance={distance * 0.4}
          maxDistance={distance * 3}
        />
      </Canvas>
    </div>
  );
}
