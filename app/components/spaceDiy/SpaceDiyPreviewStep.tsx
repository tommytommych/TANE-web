'use client';

// 「AI空間DIY」STEP5〜8：提案家具の3Dプレビュー・サイズ/素材/色設定・
// 「🌿 この家具を作る」（ブラウザCADへの引き継ぎ）。
// 新しい3D生成エンジンは作らず、既存のCadViewport（app/components/cad/CadViewport.tsx）と
// buildFurnitureModel（app/lib/cad/model.ts）をそのまま再利用する。
// CADへの引き継ぎも、既存のCompletionCards.tsxと全く同じ仕組み（StudioSpecを
// sessionStorage[CAD_INITIAL_DESIGN_SESSION_KEY]へ書き込んでから/app/cadへ遷移）を使う。
// 専用の別フォーマットは作らない。

import { useMemo, useState } from 'react';
import Link from 'next/link';
import CadViewport from '../cad/CadViewport';
import { buildFurnitureModel } from '../../lib/cad/model';
import { CAD_INITIAL_DESIGN_SESSION_KEY, type StudioSpec, type PanelFinish } from '../../lib/studioSpec';
import type { FurnitureProposal } from '../../lib/spaceDiy/recommend';

interface SpaceDiyPreviewStepProps {
  proposal: FurnitureProposal;
  onBack: () => void;
}

const COLOR_LABELS: Record<PanelFinish, string> = {
  clear: 'ナチュラル（クリア塗装）',
  walnut: 'ダーク（ウォルナット調）',
  white: 'ホワイト',
  black: 'ブラック',
};

const DEFAULT_THICKNESS_MM = 18;

const isDimensionValid = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

// 入力欄が空・0・範囲外の間も3Dプレビューが例外でクラッシュしないよう、既存のCAD側
// （studioSpec.tsのisSafeStudioSpecDimensions）と同じ考え方で安全な値に丸める。
// 「0以下・NaN・極端に小さい高さ」はbuildFurniturePanels（app/lib/cad/geometry.ts）が
// 例外を投げる既知の条件のため（実機検証で発覚：寸法を空にするとエラーになる）、
// 入力欄自体の表示・バリデーション（isDimensionValid）とは別に、3Dモデル生成用の値だけ
// 家具の可変範囲内にクランプする
const safeDimension = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value > 0 ? Math.min(Math.max(value, min), max) : min;

export default function SpaceDiyPreviewStep({ proposal, onBack }: SpaceDiyPreviewStepProps) {
  const { furniture, space } = proposal;
  const [width, setWidth] = useState(proposal.initialWidth);
  const [height, setHeight] = useState(proposal.initialHeight);
  const [depth, setDepth] = useState(proposal.initialDepth);
  const [material, setMaterial] = useState<string>(furniture.materials[0]);
  const [finish, setFinish] = useState<PanelFinish>(furniture.colors[0] ?? 'clear');

  const sizeValid =
    isDimensionValid(width, furniture.minWidth, furniture.maxWidth) &&
    isDimensionValid(height, furniture.minHeight, furniture.maxHeight) &&
    isDimensionValid(depth, furniture.minDepth, furniture.maxDepth);

  // 3Dプレビュー用：箱型（kind:'box'）の家具のみを扱うβ版のため、常にkind指定なし
  // （既存のFurnitureDesign規約で省略時は箱型として扱われる）で組み立てる。
  // 入力欄の生の値ではなく、safeDimensionで丸めた値を使う（上記コメント参照）
  const design = useMemo(
    () => ({
      width: safeDimension(width, furniture.minWidth, furniture.maxWidth),
      depth: safeDimension(depth, furniture.minDepth, furniture.maxDepth),
      height: safeDimension(height, furniture.minHeight, furniture.maxHeight),
      thickness: DEFAULT_THICKNESS_MM,
      backPanel: true,
      legs: false,
      shelves: [],
    }),
    [width, depth, height, furniture]
  );
  const partFinishes = useMemo(
    () => (finish === 'clear' ? undefined : { 天板: finish, 底板: finish, 側板: finish, 背板: finish }),
    [finish]
  );
  const model = useMemo(
    () => buildFurnitureModel(design, { material, partFinishes, name: furniture.name }),
    [design, material, partFinishes, furniture.name]
  );

  const handleBuildClick = () => {
    const spec: StudioSpec = {
      item: furniture.name,
      kind: 'box',
      width,
      depth,
      height,
      thickness: DEFAULT_THICKNESS_MM,
      material,
      panelFinishes: finish === 'clear' ? undefined : { 天板: finish, 底板: finish, 側板: finish, 背板: finish },
    };
    try {
      sessionStorage.setItem(CAD_INITIAL_DESIGN_SESSION_KEY, JSON.stringify(spec));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
      <button onClick={onBack} className="text-xs font-bold text-tanei-ink-muted hover:text-tanei-brand text-left w-fit">
        ← 家具の候補に戻る
      </button>

      <div className="rounded-tanei-card border border-tanei-border bg-white overflow-hidden shadow-sm">
        <CadViewport model={model} className="h-64 w-full" selectedPanelId={null} onSelectPanel={() => {}} />
      </div>

      <div className="rounded-tanei-card border border-tanei-border bg-white p-3 flex flex-col gap-1">
        <span className="text-sm font-bold text-tanei-ink">{furniture.name}</span>
        <span className="text-xs text-tanei-ink-muted">{furniture.description}</span>
        {space && (
          <span className="text-xs text-tanei-ink-muted">
            AI提案理由：{space.name}（{space.description}）
          </span>
        )}
        <span className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          ⚠️ AI推定寸法・製作前に必ず実測してください
        </span>
      </div>

      <div className="rounded-tanei-card border border-tanei-border bg-white p-3 flex flex-col gap-3">
        <span className="text-xs font-bold text-tanei-ink">サイズ・素材・色を設定</span>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: 'width' as const, label: '幅', value: width, set: setWidth, min: furniture.minWidth, max: furniture.maxWidth },
              { key: 'height' as const, label: '高さ', value: height, set: setHeight, min: furniture.minHeight, max: furniture.maxHeight },
              { key: 'depth' as const, label: '奥行', value: depth, set: setDepth, min: furniture.minDepth, max: furniture.maxDepth },
            ]
          ).map((dim) => {
            const valid = isDimensionValid(dim.value, dim.min, dim.max);
            return (
              <label key={dim.key} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-tanei-ink-muted">{dim.label}（mm）</span>
                <input
                  type="number"
                  // 消去中に「0」へ勝手に戻ってしまうと入力し直しづらいため、空欄はNaNのまま
                  // 保持する（isDimensionValid・safeDimensionのどちらもNaNを「無効」として
                  // 正しく扱うため、これでクラッシュはしない）
                  value={Number.isNaN(dim.value) ? '' : dim.value}
                  onChange={(e) => {
                    const raw = e.target.value;
                    dim.set(raw === '' ? NaN : Number(raw));
                  }}
                  className={`border rounded-tanei-control px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-tanei-brand ${
                    valid ? 'border-tanei-border' : 'border-red-400 bg-red-50'
                  }`}
                />
                {!valid && (
                  <span className="text-[10px] text-red-500">
                    {dim.min}〜{dim.max}mm
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-tanei-ink-muted">素材</span>
          <div className="flex flex-wrap gap-1.5">
            {furniture.materials.map((m) => (
              <button
                key={m}
                onClick={() => setMaterial(m)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  material === m
                    ? 'bg-tanei-accent text-white border-tanei-accent'
                    : 'bg-white text-tanei-ink border-tanei-border hover:border-tanei-brand'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-tanei-ink-muted">色</span>
          <div className="flex flex-wrap gap-1.5">
            {furniture.colors.map((c) => (
              <button
                key={c}
                onClick={() => setFinish(c)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  finish === c
                    ? 'bg-tanei-accent text-white border-tanei-accent'
                    : 'bg-white text-tanei-ink border-tanei-border hover:border-tanei-brand'
                }`}
              >
                {COLOR_LABELS[c] ?? c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Link
        href="/app/cad"
        onClick={handleBuildClick}
        aria-disabled={!sizeValid}
        onClickCapture={(e) => {
          if (!sizeValid) e.preventDefault();
        }}
        className={`text-center bg-tanei-brand text-white text-sm font-bold py-3 rounded-tanei-control transition-colors ${
          sizeValid ? 'hover:bg-tanei-brand-dark' : 'opacity-50 cursor-not-allowed'
        }`}
      >
        🌿 この家具を作る
      </Link>
    </div>
  );
}
