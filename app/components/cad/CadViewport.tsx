'use client';

// ブラウザCADの3Dビューア。FurnitureModelのpanelsをBoxGeometryとして描画し、
// タップ・クリックでパーツを選択できる（スマホでもR3Fのポインターイベントが
// タッチを同様に扱うため、追加の分岐は不要）。
// tanei-studio/static/index.htmlの素のThree.js実装（カメラ・ライティングの考え方）を
// React Three Fiberへ移植した構成。FreeCAD版と違いネイティブアプリ・サーバーに
// 一切依存せず、ブラウザだけで完結する。

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { FurnitureModel } from '../../lib/cad/types';
import { furnitureModelToViewerPanels } from '../../lib/cad/model';
import { createWoodGrainTexture } from './woodGrainTexture';

// 木目の見た目の密度（mm）。板の長辺がおおよそこの長さごとに1回、木目模様が
// 繰り返されるようにする（値が小さいほど木目が細かく、大きいほど粗く見える）
const WOOD_GRAIN_PERIOD_MM = 140;

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

// 取っ手（ハンドル）の見た目用の色。木材のどの色とも被らない、金属パーツらしい
// 暗いグレーにすることで、扉・引き出しどうしを見分けやすくする（Phase D追加要望：
// 引き出し=1個のときに扉と全く同じ見た目になってしまう問題への対応）
const HANDLE_COLOR = '#2b2b2b';

// 取っ手はFurnitureDesign/FurniturePanelには一切持たせない、CadViewport.tsxだけの
// 表示専用パーツ（金具はDIYでは購入するものであり、木取り図・カットリストの対象では
// ないため）。扉の取っ手は蝶番と反対側の縦の縁に、引き出しの取っ手は前板上端寄りの
// 横棒に配置する、という単純なルールだけを持たせる
const DOOR_HANDLE_WIDTH_MM = 8;
const DOOR_HANDLE_LENGTH_MM = 120;
const DOOR_HANDLE_PROTRUSION_MM = 7;
const DOOR_HANDLE_INSET_MM = 22;

const DRAWER_HANDLE_HEIGHT_MM = 8;
const DRAWER_HANDLE_PROTRUSION_MM = 7;
const DRAWER_HANDLE_WIDTH_RATIO = 0.4;
const DRAWER_HANDLE_INSET_FROM_TOP_MM = 18;

/** 扉の取っ手。1枚扉は右端、観音開き（2枚）は互いに向き合う内側の縁（中央寄り）に
 * 配置し、「扉が2枚に分かれて開く」ことが一目で分かるようにする */
function DoorHandle({ panelId, widthMm, heightMm, thicknessMm }: { panelId: string; widthMm: number; heightMm: number; thicknessMm: number }) {
  const isLeftOfPair = panelId === 'door-left';
  const isRightOfPair = panelId === 'door-right';
  // door-left（左側の扉）は自分の右端、door-right（右側の扉）は自分の左端、
  // 単独の扉（id==='door'）は右端に取っ手を置く
  const sign = isLeftOfPair || !isRightOfPair ? 1 : -1;
  const handleLengthMm = Math.min(DOOR_HANDLE_LENGTH_MM, heightMm * 0.5);
  const xMm = sign * (widthMm / 2 - DOOR_HANDLE_INSET_MM);
  const zMm = -(thicknessMm / 2 + DOOR_HANDLE_PROTRUSION_MM / 2);
  return (
    <mesh position={[xMm * MM_TO_SCENE, 0, zMm * MM_TO_SCENE]}>
      <boxGeometry
        args={[DOOR_HANDLE_WIDTH_MM * MM_TO_SCENE, handleLengthMm * MM_TO_SCENE, DOOR_HANDLE_PROTRUSION_MM * MM_TO_SCENE]}
      />
      <meshStandardMaterial color={HANDLE_COLOR} roughness={0.4} metalness={0.3} />
    </mesh>
  );
}

/** 引き出しの取っ手。前板の上端寄りに、幅の一部を使った横棒として配置する
 * （扉の縦向きの取っ手とはっきり区別できる形にする） */
function DrawerHandle({ widthMm, heightMm, thicknessMm }: { widthMm: number; heightMm: number; thicknessMm: number }) {
  const handleWidthMm = widthMm * DRAWER_HANDLE_WIDTH_RATIO;
  const yMm = heightMm / 2 - DRAWER_HANDLE_INSET_FROM_TOP_MM;
  const zMm = -(thicknessMm / 2 + DRAWER_HANDLE_PROTRUSION_MM / 2);
  return (
    <mesh position={[0, yMm * MM_TO_SCENE, zMm * MM_TO_SCENE]}>
      <boxGeometry
        args={[handleWidthMm * MM_TO_SCENE, DRAWER_HANDLE_HEIGHT_MM * MM_TO_SCENE, DRAWER_HANDLE_PROTRUSION_MM * MM_TO_SCENE]}
      />
      <meshStandardMaterial color={HANDLE_COLOR} roughness={0.4} metalness={0.3} />
    </mesh>
  );
}

function PanelMesh({
  panel,
  isSelected,
  onSelect,
}: {
  panel: ReturnType<typeof furnitureModelToViewerPanels>[number];
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const { x, y, z, dx, dy, dz, color, id, isPainted, kind } = panel;
  // tanei-studioの座標系（原点=本体の左手前下、y=奥行方向で背板側が大きい値）を、
  // Three.jsの座標系（X=幅, Y=高さ, Z=奥行）へ変換するため、パネル位置にサイズの
  // 半分を足して「箱の中心座標」にしている
  const position: [number, number, number] = [
    (x + dx / 2) * MM_TO_SCENE,
    (z + dz / 2) * MM_TO_SCENE,
    (y + dy / 2) * MM_TO_SCENE,
  ];
  const size: [number, number, number] = [dx * MM_TO_SCENE, dz * MM_TO_SCENE, dy * MM_TO_SCENE];

  // Phase D「木材表現」：ホワイト/ブラックの塗装仕上げ（不透明な塗料）は木目を隠すため
  // テクスチャを使わず単色のまま、それ以外（無指定・クリア塗装・ウォルナット調）は木目
  // テクスチャを重ねる。板のサイズに応じてrepeatを変え、大きい板でも小さい板でも
  // 木目の粗さが揃って見えるようにする
  const woodTexture = useMemo(() => {
    if (isPainted) return null;
    return createWoodGrainTexture(color, dx / WOOD_GRAIN_PERIOD_MM, dz / WOOD_GRAIN_PERIOD_MM);
  }, [isPainted, color, dx, dz]);
  useEffect(() => () => woodTexture?.dispose(), [woodTexture]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    // 手前のパネルだけを選択する（クリック位置の奥にある他パネルまで連鎖して
    // 反応しないようにする。R3Fの既定ではraycast命中順に全てへイベントが伝播するため）
    event.stopPropagation();
    onSelect(id);
  };

  return (
    <group position={position}>
      <mesh name={panel.label} onClick={handleClick}>
        <boxGeometry args={size} />
        <meshStandardMaterial
          // 木目テクスチャは下絵の時点で既にcolorHexで塗りつぶしているため、ここで
          // さらにcolorを掛け合わせると二重に色が乗ってしまう。テクスチャ使用時は
          // 白（無着色）にし、テクスチャの色をそのまま見せる
          color={woodTexture ? '#ffffff' : color}
          map={woodTexture}
          roughness={0.85}
          emissive={isSelected ? '#5F8D69' : '#000000'}
          emissiveIntensity={isSelected ? 0.45 : 0}
          // 【重要】mapがTexture→nullへ切り替わる際（例: 木目テクスチャ表示のパーツに
          // ホワイト/ブラック塗装を選んだ場合）、Three.jsはシェーダーの再コンパイルを
          // 自動検知しないことがあり、material.mapがnullになった後もGPU側は直前の
          // テクスチャを参照し続けてしまう不具合を実機確認した（ホワイトを選んでも
          // 直前の木目テクスチャの色味が残ってしまい、しっかり白にならなかった）。
          // onUpdateでmaterial.needsUpdateを明示的に立てることでシェーダーを
          // 再コンパイルさせ、mapの有無の切り替えを確実に反映させる
          onUpdate={(m) => {
            m.needsUpdate = true;
          }}
        />
        {/* tanei-studio/static/index.htmlの素のThree.js実装（LineSegments+EdgesGeometry、
            色0x3a2f27）と同じ考え方：パーツの輪郭を暗い線で強調することで、扉・引き出しの
            隙間（2〜3mm）のような狭いギャップでも別パーツだと視認しやすくする */}
        <Edges color="#3a2f27" threshold={15} />
      </mesh>
      {/* 取っ手（表示専用、FurnitureDesign/FurniturePanelには持たせない）。扉と引き出しの
          前板は形状だけだと見分けが付きにくいため、縦の取っ手（扉）・横の取っ手（引き出し）
          で視覚的に区別できるようにする */}
      {kind === 'door' && <DoorHandle panelId={id} widthMm={dx} heightMm={dz} thicknessMm={dy} />}
      {kind === 'drawer' && <DrawerHandle widthMm={dx} heightMm={dz} thicknessMm={dy} />}
    </group>
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
  // 以前は1.8倍だったため、特にテーブルのように幅が高さよりずっと大きい家具で、
  // 初期表示のモデルが画面いっぱいに大きく映りすぎていた（実機確認で報告）。
  // 周囲に余白ができるよう、後方へ引く距離を広げる
  const distance = maxDimMm * MM_TO_SCENE * 2.4;

  // 接地シャドウ（ContactShadows）を置くY座標。脚ありの場合、脚の分だけ本体底面より
  // 下（マイナス側）が実際の設置面になるため、0（本体底面）ではなく全パネルの最小z値
  // （furnitureModelToViewerPanels基準、脚があれば負の値）を使う
  const floorY = Math.min(0, ...panels.map((p) => p.z)) * MM_TO_SCENE;

  // シャドウの広がり（scale）は、高さを含むmaxDimMmではなく設置面の footprint（幅・奥行）
  // だけで決める。以前はmaxDimMm（背の高い家具では高さが最大になりやすい）を使っていたため、
  // 実際の設置面（幅750×奥行300mm程度）に対してシャドウの直径が3m近くになり、本体から
  // 大きく離れた場所までぼやけた影が伸びて見える不具合があった（Phase F相当の見た目調整）
  const footprintMm = Math.max(model.width, model.depth, 1);

  const setView = (mode: 'front' | 'oblique' | 'side' | 'top') => {
    const controls = controlsRef.current;
    if (!controls) return;
    const [cx, cy, cz] = center;
    if (mode === 'top') {
      // 真上から見下ろす。カメラのup方向（既定は(0,1,0)＝Y軸）が視線方向
      // （こちらもほぼ真下=Y軸方向）とほぼ平行になり、カメラのroll（画面の回転）が
      // 数学的に不定になる「ジンバルロック」が起きる。これによりOrbitControls・
      // レンダリングが不安定になり、キャンバスの隅に前フレームの残像のような
      // 描画崩れが出ることを確認したため、upを視線と直交する(0,0,-1)へ明示的に
      // 変更してから真上に配置する（真上ビュー以外に切り替える際は元の(0,1,0)に戻す）
      controls.object.up.set(0, 0, -1);
      controls.object.position.set(cx, cy + distance, cz);
    } else {
      controls.object.up.set(0, 1, 0);
      if (mode === 'front') {
        // モデルのZ座標は奥行方向（tanei-studio座標系のy）に対応し、Z=0側が手前＝正面、
        // Zが大きいほど背板側＝背面になる（PanelMeshのposition変換を参照）。
        // カメラを正面側（Zが小さい側）に置いてモデル中心を見ることで、正しく正面が映る
        controls.object.position.set(cx, cy, cz - distance);
      } else if (mode === 'side') {
        // 側板が正面から見える角度（X軸方向の真横）にカメラを置く
        controls.object.position.set(cx + distance, cy, cz);
      } else {
        // 「斜めから見る」は正面と同じZがマイナス側（手前）に置き、右斜め上から見下ろす
        // アングルにする。以前はZがプラス側（背面寄り）になっており、意図と異なり
        // 背後寄りの視点になっていた
        controls.object.position.set(cx + distance, cy + distance * 0.8, cz - distance);
      }
    }
    controls.target.set(cx, cy, cz);
    controls.update();
  };

  return (
    <div className={`relative ${className ?? 'h-full w-full'}`}>
      {/* 初心者向けのカメラプリセット。OrbitControlsでも同じ視点に手動で回せるが、
          「正面」「側面」「上面」「斜め」というボタンにしておくと、3D操作に不慣れな人でも
          迷わない（Phase D：完成イメージ機能をブラウザCADへ統合するにあたり、
          旧完成イメージが持っていなかった視点の選びやすさをむしろ強化する） */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setView('front')}
          className="bg-white/90 hover:bg-white text-tanei-ink text-xs font-bold px-3 py-1.5 rounded-full border border-tanei-border shadow-sm transition-colors"
        >
          正面から見る
        </button>
        <button
          type="button"
          onClick={() => setView('side')}
          className="bg-white/90 hover:bg-white text-tanei-ink text-xs font-bold px-3 py-1.5 rounded-full border border-tanei-border shadow-sm transition-colors"
        >
          側面から見る
        </button>
        <button
          type="button"
          onClick={() => setView('top')}
          className="bg-white/90 hover:bg-white text-tanei-ink text-xs font-bold px-3 py-1.5 rounded-full border border-tanei-border shadow-sm transition-colors"
        >
          上面から見る
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
        <div className="absolute bottom-3 right-3 z-10 bg-tanei-brand text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
          {selectedLabel}を選択中
        </div>
      )}

      <Canvas
        // 初期表示は「正面から見る」ボタン（setView('front')）と同じ計算式にする。
        // 以前はここだけ斜め視点の式のままになっており、開いた直後は常に斜めから
        // 始まってしまっていた
        camera={{ position: [center[0], center[1], center[2] - distance], fov: 45 }}
        style={{ touchAction: 'none' }}
        onPointerMissed={() => onSelectPanel(null)}
      >
        <color attach="background" args={['#FAF8F4']} />
        {/* Phase D：照明を単一のambientLight+directionalLightから、空側／地面側で
            色味が変わるhemisphereLightへ変更し、平坦になりがちだった陰影に自然な
            グラデーションを持たせる。地面に接地している立体感は、下のContactShadows
            （常にscene全体を毎フレーム再計算する柔らかい落ち影）で表現する。
            【注意】directionalLightのpositionのZは奥行方向（PanelMeshのposition変換
            参照：Z=0側が正面、Zが大きいほど背面）。「正面から見る」が既定の初期視点で
            あるため、Zをマイナス（正面寄り）にして主光源が正面をきちんと照らすように
            している（以前はZがプラスで背面側から照らしていたため、初期表示の正面が
            暗く見えてしまっていた）。
            【castShadowは意図的に使わない】directionalLightのshadow-mapは既定の
            シャドウカメラ範囲が固定サイズで、脚（本体底面より下に伸びる）・扉
            （本体前面より手前に飛び出す）のように本体の基本サイズを超えて配置される
            パーツがあると、真上から見た際にシャドウマップの範囲外になり、キャンバスの
            隅に本来存在しないはずの黒い矩形が描画される不具合を実機確認した。
            毎回モデル寸法に応じてシャドウカメラ範囲を追従させる実装は複雑になるため、
            今回はcastShadowを使わず、ContactShadowsだけで陰影表現を担う方針にする */}
        <hemisphereLight args={['#FFF6E8', '#8C7A66', 0.65]} />
        <directionalLight position={[2, 6, -2]} intensity={1.1} />
        {panels.map((panel) => (
          <PanelMesh key={panel.id} panel={panel} isSelected={panel.id === selectedPanelId} onSelect={onSelectPanel} />
        ))}
        <ContactShadows position={[center[0], floorY, center[2]]} opacity={0.45} scale={footprintMm * MM_TO_SCENE * 1.5} blur={1.4} far={distance * 4} />
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
