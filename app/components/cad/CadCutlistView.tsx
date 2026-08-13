'use client';

// 「木取り図」画面。CADで設計した家具（FurnitureModel）から、既存の木取り計算
// エンジン（app/lib/sheetLayout.ts）・SVG表示（SheetLayoutSvg.tsx）・PDF生成
// （app/lib/cutSheetPdf.ts）をそのまま再利用して、実際にホームセンターへ持って
// いけるカット依頼書まで作れるようにする。新しい木取り計算ロジックは作らない。
//
// 「CAD」「Panel」「SheetLayout」といった開発者向けの言葉は画面に出さず、
// 「設計」「材料」「木取り図」という言葉だけを使う。

import { useEffect, useMemo, useState } from 'react';
import { packSheetLayout } from '../../lib/sheetLayout';
import SheetLayoutSvgView from '../chat/SheetLayoutSvg';
import { buildUniversalCutSheetPdf } from '../../lib/cutSheetPdf';
import { downloadPdfBytes } from '../../lib/download';
import type { FurnitureModel } from '../../lib/cad/types';
import {
  CUT_LIST_KIND_NAME,
  FURNITURE_MATERIALS,
  furnitureModelToDimensionalLumberItems,
  furnitureModelToSheetLayout,
  furnitureModelToSheetLayoutsByMaterial,
  getAllowedMaterialsForPartLabel,
  type CutListItem,
  type PartMaterialLabel,
} from '../../lib/cad/model';
import CadBuildGuide from './CadBuildGuide';

// 制作チェック画面の「制作へ進む」から来たときだけ、この要素まで自動スクロールする
// （CadBuildGuide自体は変更せず、外側にidを持つラッパーを用意するだけにしている）
const BUILD_GUIDE_ANCHOR_ID = 'cad-build-guide';
// 制作チェックの「木取り図を確認した」からの確認導線（Phase 3-10）のスクロール先
const CUT_LAYOUT_ANCHOR_ID = 'cad-cut-layout';

interface CadCutlistViewProps {
  model: FurnitureModel;
  material: string;
  onMaterialChange: (material: string) => void;
  /** パーツ単位の材料上書き（「天板だけパイン集成材、脚・幕板はSPF材」等）。
   * キーが無いパーツはmaterialを使う */
  partMaterials: Partial<Record<PartMaterialLabel, string>>;
  onPartMaterialChange: (label: PartMaterialLabel, value: string) => void;
  onBack: () => void;
  onOpenCutList: () => void;
  /** trueのとき、マウント時に「制作する」セクションまで自動スクロールする
   * （Phase 2-7の通常の「🪚 木取り図を見る」からの遷移では常にfalse／未指定） */
  scrollToBuildGuide?: boolean;
  onScrolledToBuildGuide?: () => void;
  /** 「作るパーツ」の「このパーツを見る」から呼ばれる（Phase 3-2） */
  onViewPanel: (panelId: string) => void;
  /** 制作チェック（Phase 2-7）のチェック状態。CadBuildGuideの制作進捗表示にそのまま渡す
   * だけで、ここでは読み書きしない（Phase 3-5） */
  buildChecklist: Record<string, boolean>;
  /** 「作り方」9STEPそれぞれのチェック状態（buildChecklistとは独立）。CadBuildGuideへ
   * そのまま中継するだけで、ここでは読み書きしない */
  buildGuideChecked: Record<string, boolean>;
  onToggleBuildGuideStep: (step: number) => void;
  /** CadBuildGuideの「制作チェックを見る」から呼ばれる（Phase 3-5） */
  onViewBuildCheck: () => void;
  /** 制作チェックの各項目の「確認する」導線（Phase 3-10）から指定される、この画面内の
   * スクロール先id。Phase 2-9のscrollToBuildGuideとは別の、並行する仕組み */
  pendingAnchor?: string | null;
  onScrolledToPendingAnchor?: () => void;
}

export default function CadCutlistView({
  model,
  material,
  onMaterialChange,
  partMaterials,
  onPartMaterialChange,
  onBack,
  onOpenCutList,
  scrollToBuildGuide,
  onScrolledToBuildGuide,
  onViewPanel,
  buildChecklist,
  buildGuideChecked,
  onToggleBuildGuideStep,
  onViewBuildCheck,
  pendingAnchor,
  onScrolledToPendingAnchor,
}: CadCutlistViewProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 材料ごとに分離した木取り図（「天板はパイン集成材、脚・幕板はSPF材」等の場合、
  // 材料の種類だけ配列に並ぶ。全パーツ同じ材料なら要素数1になり、見た目は今まで通り）。
  // SPF材等の規格材（getFurnitureMaterialType参照）はここには含まれない
  // （サブロク板から切り出す対象ではないため）
  const sheetLayouts = useMemo(() => furnitureModelToSheetLayoutsByMaterial(model), [model]);
  const packedByLayout = useMemo(() => sheetLayouts.map((layout) => packSheetLayout(layout)), [sheetLayouts]);
  const totalSheetCount = packedByLayout.reduce((sum, sheets) => sum + sheets.length, 0);

  // 規格材（SPF材等）は板取り図を作らない代わりに、材料ごとの部材一覧として表示する
  const dimensionalLumberItems = useMemo(() => furnitureModelToDimensionalLumberItems(model), [model]);
  const dimensionalLumberGroups = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, CutListItem[]>();
    dimensionalLumberItems.forEach((item) => {
      const list = groups.get(item.material);
      if (list) {
        list.push(item);
      } else {
        groups.set(item.material, [item]);
        order.push(item.material);
      }
    });
    return order.map((groupMaterial) => ({ material: groupMaterial, items: groups.get(groupMaterial) ?? [] }));
  }, [dimensionalLumberItems]);

  // 板材（sheetLayouts）が1件も無い場合（理論上、全パーツが規格材の場合のみ発生しうる
  // 稀なケース）だけ、CadBuildGuide.tsx向けに既存のfurnitureModelToSheetLayout
  // （全材料混在の単一板版、furnitureModelToSheetLayoutsByMaterial導入前から存在する関数）へ
  // フォールバックする。CadBuildGuide自体の必須propsを満たすためだけの措置で、
  // 板材が1件でもあれば従来通りそちらを使う
  const fallbackLayout = useMemo(
    () => (sheetLayouts.length === 0 ? furnitureModelToSheetLayout(model) : null),
    [sheetLayouts, model]
  );
  const fallbackSheets = useMemo(() => (fallbackLayout ? packSheetLayout(fallbackLayout) : []), [fallbackLayout]);

  // CadBuildGuide.tsxは単一のsheetLayout/material/sheetCountという既存のprops形のまま。
  // 全体のmaterialに対応するレイアウトを代表として渡し、
  // 見つからない場合（全パーツが上書きされ、全体のmaterialを使うパーツが1つも無い場合）は
  // 先頭のレイアウトに、板材自体が無い場合はfallbackLayoutにフォールバックする
  const primaryLayoutIndex = Math.max(
    0,
    sheetLayouts.findIndex((layout) => layout.name.startsWith(material))
  );
  const primaryLayout = sheetLayouts[primaryLayoutIndex] ?? fallbackLayout;
  const primarySheetCount = packedByLayout[primaryLayoutIndex]?.length ?? fallbackSheets.length;

  // 実在するパーツ種類（天板・脚・幕板等、CUT_LIST_KIND_NAMEの値）だけを、登場順で重複無く
  // 列挙する。「パーツごとに材料を分ける」の選択肢一覧に使う
  const availablePartLabels = useMemo(() => {
    const labels: PartMaterialLabel[] = [];
    model.panels.forEach((panel) => {
      const label = CUT_LIST_KIND_NAME[panel.kind] as PartMaterialLabel | undefined;
      if (label && !labels.includes(label)) labels.push(label);
    });
    return labels;
  }, [model.panels]);

  useEffect(() => {
    if (!scrollToBuildGuide) return;
    document.getElementById(BUILD_GUIDE_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onScrolledToBuildGuide?.();
  }, [scrollToBuildGuide, onScrolledToBuildGuide]);

  // Phase 2-9のscrollToBuildGuide用useEffectとは別に、Phase 3-10専用の並行したスクロール処理。
  // 既存のuseEffectは変更せず、新しい対象（pendingAnchor）だけを扱う
  useEffect(() => {
    if (!pendingAnchor) return;
    document.getElementById(pendingAnchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onScrolledToPendingAnchor?.();
  }, [pendingAnchor, onScrolledToPendingAnchor]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleDownloadPdf = async () => {
    if (sheetLayouts.length === 0 && dimensionalLumberItems.length === 0) return;
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await buildUniversalCutSheetPdf(
        [],
        sheetLayouts,
        {
          name: model.name,
          material,
          sheetCount: totalSheetCount,
        },
        dimensionalLumberItems
      );
      downloadPdfBytes(new Uint8Array(pdfBytes), 'TANEi_CutSheet.pdf');
      showStatus('カット申込書のダウンロードが完了しました！');
    } catch (error) {
      console.error(error);
      showStatus('カット申込書の生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      {statusMessage && (
        <div
          role="status"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-tanei-brand-dark text-white px-5 py-3 rounded-2xl shadow-xl text-sm flex items-center gap-3 max-w-[90vw] text-center"
        >
          <span>🌱</span>
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="p-4 pb-24 max-w-2xl mx-auto w-full flex flex-col gap-4">
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand"
        >
          ← 設計に戻る
        </button>

        <div>
          <h2 className="text-lg font-black text-tanei-ink">木取り図</h2>
          <p className="text-xs text-tanei-ink-muted mt-0.5">
            設計した家具のパーツを、実際の板からどう切り出すかを自動計算しています
          </p>
        </div>

        <div className="bg-tanei-surface rounded-tanei-control border border-tanei-border p-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 max-w-xs">
            <span className="text-xs font-bold text-tanei-ink-muted">使用する材料</span>
            <select
              value={material}
              onChange={(e) => onMaterialChange(e.target.value)}
              className="border border-tanei-border rounded-tanei-control px-3 py-2 text-sm text-tanei-ink font-bold bg-white focus:outline-none focus:ring-2 focus:ring-tanei-brand"
            >
              {FURNITURE_MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {/* 「パーツごとに材料を分ける」で個別設定したパーツにはここを変えても反映
                されない（下の一覧に「個別設定中」と表示される）ため、その旨を明記する */}
            <span className="text-[11px] text-tanei-ink-muted font-normal">
              個別設定していないパーツ全てに使われます
            </span>
          </label>

          {/* パーツごとに材料を分ける（任意）。「天板はパイン集成材、脚・幕板はSPF材」のように、
              一部のパーツだけ上の「使用する材料」と異なる材料を指定できる。既定（空欄）は
              全パーツが上の材料に従う、という既存の挙動のまま */}
          {availablePartLabels.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-bold text-tanei-ink-muted select-none">
                パーツごとに材料を分ける（任意）
              </summary>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availablePartLabels.map((label) => (
                  <label key={label} className="flex flex-col gap-1">
                    <span className="font-bold text-tanei-ink-muted">{label}</span>
                    <select
                      value={partMaterials[label] ?? ''}
                      onChange={(e) => onPartMaterialChange(label, e.target.value)}
                      className="border border-tanei-border rounded-tanei-control px-2 py-1.5 text-xs text-tanei-ink font-bold bg-white focus:outline-none focus:ring-2 focus:ring-tanei-brand"
                    >
                      <option value="">（全体の材料に合わせる）</option>
                      {/* 脚・幕板は規格材（SPF材系）、それ以外は板材のみに選択肢を絞り、
                          「テーブルの脚が合板」のような現実にありえない組み合わせを
                          選べないようにする（getAllowedMaterialsForPartLabel参照） */}
                      {getAllowedMaterialsForPartLabel(label).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          )}

          {(sheetLayouts.length > 0 || dimensionalLumberItems.length > 0) && (
            <div className="text-sm text-tanei-ink flex flex-wrap gap-x-4 gap-y-1">
              {sheetLayouts.length > 0 && (
                <span>
                  必要枚数：<span className="font-black text-tanei-brand">{totalSheetCount}枚</span>
                </span>
              )}
              {dimensionalLumberItems.length > 0 && (
                <span>
                  規格材の部材：
                  <span className="font-black text-tanei-brand">
                    {dimensionalLumberItems.reduce((sum, item) => sum + item.qty, 0)}本
                  </span>
                </span>
              )}
              {sheetLayouts.length > 1 && (
                <span className="text-tanei-ink-muted text-xs">（板材{sheetLayouts.length}種類の材料）</span>
              )}
            </div>
          )}
        </div>

        {sheetLayouts.length > 0 || dimensionalLumberItems.length > 0 ? (
          <>
            {sheetLayouts.length > 0 && (
              <div>
                <h3 id={CUT_LAYOUT_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">木取り図</h3>
                <div className="flex flex-col gap-3">
                  {sheetLayouts.map((layout) => (
                    <SheetLayoutSvgView key={layout.name} layout={layout} showToast={showStatus} />
                  ))}
                </div>
              </div>
            )}

            {/* 規格材（SPF材等）は板から切り出す対象ではないため、木取り図（板取り図）を
                作らず、材料ごとに「パーツ名×数量・寸法」だけをコンパクトに一覧表示する。
                板取り図が無い分、SPF材だけの家具でも画面が縦に長くならない */}
            {dimensionalLumberGroups.length > 0 && (
              <div>
                {!sheetLayouts.length && (
                  <h3 className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">木取り図</h3>
                )}
                <div className="flex flex-col gap-2">
                  {dimensionalLumberGroups.map((group) => (
                    <div
                      key={group.material}
                      className="bg-white rounded-tanei-control border border-tanei-border p-3"
                    >
                      <p className="text-xs font-bold text-tanei-brand mb-1.5">
                        {group.material}（規格材・板取り図なし）
                      </p>
                      <ul className="flex flex-col gap-1">
                        {group.items.map((item) => (
                          <li key={item.id} className="flex items-center justify-between text-sm gap-2">
                            <span className="font-bold text-tanei-ink">
                              {item.name}
                              <span className="text-tanei-ink-muted font-normal"> ×{item.qty}</span>
                            </span>
                            <span className="text-tanei-ink-muted text-xs text-right">
                              {item.widthMm} × {item.heightMm} × {item.thicknessMm} mm
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-tanei-ink mb-1">パーツ一覧</h3>
              <ul className="rounded-tanei-control border border-tanei-border divide-y divide-tanei-border overflow-hidden bg-white">
                {model.panels.map((panel) => {
                  // panel.materialは、buildFurnitureModel()が「パーツごとに材料を分ける」の
                  // 上書き（partMaterials）がある場合だけ設定する（geometry.ts側では設定
                  // されない）。そのため値の有無＝このパーツだけ個別設定中、と判定できる
                  const partLabel = CUT_LIST_KIND_NAME[panel.kind] as PartMaterialLabel | undefined;
                  const isOverridden = Boolean(panel.material);
                  return (
                    <li key={panel.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-bold text-tanei-ink">{panel.label}</span>
                      <span className="text-tanei-ink-muted text-xs text-right">
                        {Math.round(panel.size.x)} × {Math.round(panel.size.y)} × {Math.round(panel.size.z)} mm
                        <br />
                        {panel.material ?? material}
                        {isOverridden && partLabel && (
                          <>
                            <span className="ml-1 text-tanei-accent font-bold">（個別設定中）</span>
                            <button
                              type="button"
                              onClick={() => onPartMaterialChange(partLabel, '')}
                              className="ml-1 underline hover:text-tanei-brand"
                            >
                              初期値に戻す
                            </button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex-1 bg-tanei-brand text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors disabled:opacity-50"
              >
                {isGeneratingPdf ? 'カット申込書を作成中…' : '📝 カット申込書を保存'}
              </button>
              <button
                type="button"
                onClick={onOpenCutList}
                className="flex-1 bg-tanei-accent text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-accent-dark transition-colors"
              >
                📋 カットリストを見る
              </button>
            </div>

            {primaryLayout && (
              <div id={BUILD_GUIDE_ANCHOR_ID}>
                <CadBuildGuide
                  model={model}
                  material={material}
                  sheetLayout={primaryLayout}
                  sheetCount={primarySheetCount}
                  onViewPanel={onViewPanel}
                  buildChecklist={buildChecklist}
                  buildGuideChecked={buildGuideChecked}
                  onToggleBuildGuideStep={onToggleBuildGuideStep}
                  onViewBuildCheck={onViewBuildCheck}
                />
              </div>
            )}
          </>
        ) : (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-tanei-control px-4 py-3 text-sm">
            このサイズでは、現在選択している材料の板に収まりません。
            <br />
            「← 設計に戻る」から、幅・奥行・高さをもう少し小さくするか、棚板の数を減らしてお試しください。
          </div>
        )}
      </div>
    </div>
  );
}
