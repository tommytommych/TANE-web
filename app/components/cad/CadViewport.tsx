'use client';

// ブラウザCADの3Dビューア（Phase 1時点では最小限の土台のみ）。
// FurnitureModelのpanelsをそのままBoxGeometryとして描画するだけで、パーツの選択・
// ドラッグ編集などのインタラクションはPhase 3以降で追加する。
// tanei-studio/static/index.htmlの素のThree.js実装（カメラ・ライティングの考え方）を
// React Three Fiberへ移植した最小構成。FreeCAD版と違いネイティブアプリ・サーバーに
// 一切依存せず、ブラウザだけで完結する。

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { FurnitureModel } from '../../lib/cad/types';
import { furnitureModelToViewerPanels } from '../../lib/cad/model';

interface CadViewportProps {
  model: FurnitureModel;
  className?: string;
}

// mm単位の座標をThree.jsのシーン単位（メートル相当）へ縮小する。
// 家具サイズ（数百〜数千mm）をそのままThree.js空間に置くとカメラ・ライトの
// 既定値と桁が合わないため、1/1000して扱いやすいスケールに揃える
const MM_TO_SCENE = 1 / 1000;

function PanelMesh({ x, y, z, dx, dy, dz, color, label }: ReturnType<typeof furnitureModelToViewerPanels>[number]) {
  // tanei-studioの座標系（原点=本体の左手前下）を、Three.jsの中心原点に近い配置へ
  // 変換するため、パネル位置にサイズの半分を足して「箱の中心座標」にしている
  const position: [number, number, number] = [
    (x + dx / 2) * MM_TO_SCENE,
    (z + dz / 2) * MM_TO_SCENE, // Three.jsのY軸=上下、家具モデルのZ軸=高さに対応
    (y + dy / 2) * MM_TO_SCENE,
  ];
  const size: [number, number, number] = [dx * MM_TO_SCENE, dz * MM_TO_SCENE, dy * MM_TO_SCENE];

  return (
    <mesh position={position} name={label}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

export default function CadViewport({ model, className }: CadViewportProps) {
  const panels = furnitureModelToViewerPanels(model);
  // カメラをモデルの最大寸法に応じて後方へ引く（tanei-studio側のカメラ距離計算の簡易版。
  // 厳密なフィッティングはPhase 3で必要になれば追加する）
  const maxDimMm = Math.max(model.width, model.depth, model.height, 1);
  const cameraDistance = (maxDimMm * MM_TO_SCENE) * 1.8;

  return (
    <div className={className ?? 'h-full w-full'}>
      <Canvas camera={{ position: [cameraDistance, cameraDistance * 0.8, cameraDistance], fov: 45 }}>
        <color attach="background" args={['#FAF8F4']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 2]} intensity={0.8} />
        {panels.map((panel) => (
          <PanelMesh key={panel.label} {...panel} />
        ))}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
