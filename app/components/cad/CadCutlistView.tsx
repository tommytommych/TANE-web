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
import { FURNITURE_MATERIALS, furnitureModelToSheetLayout } from '../../lib/cad/model';
import CadBuildGuide from './CadBuildGuide';

// 制作チェック画面の「制作へ進む」から来たときだけ、この要素まで自動スクロールする
// （CadBuildGuide自体は変更せず、外側にidを持つラッパーを用意するだけにしている）
const BUILD_GUIDE_ANCHOR_ID = 'cad-build-guide';

interface CadCutlistViewProps {
  model: FurnitureModel;
  material: string;
  onMaterialChange: (material: string) => void;
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
  /** CadBuildGuideの「制作チェックを見る」から呼ばれる（Phase 3-5） */
  onViewBuildCheck: () => void;
}

export default function CadCutlistView({
  model,
  material,
  onMaterialChange,
  onBack,
  onOpenCutList,
  scrollToBuildGuide,
  onScrolledToBuildGuide,
  onViewPanel,
  buildChecklist,
  onViewBuildCheck,
}: CadCutlistViewProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sheetLayout = useMemo(() => furnitureModelToSheetLayout(model), [model]);
  const sheets = useMemo(() => (sheetLayout ? packSheetLayout(sheetLayout) : []), [sheetLayout]);

  useEffect(() => {
    if (!scrollToBuildGuide) return;
    document.getElementById(BUILD_GUIDE_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onScrolledToBuildGuide?.();
  }, [scrollToBuildGuide, onScrolledToBuildGuide]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleDownloadPdf = async () => {
    if (!sheetLayout) return;
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await buildUniversalCutSheetPdf([], [sheetLayout], {
        name: model.name,
        material,
        sheetCount: sheets.length,
      });
      downloadPdfBytes(new Uint8Array(pdfBytes), 'TANEi_CutSheet.pdf');
      showStatus('木取り図PDFのダウンロードが完了しました！');
    } catch (error) {
      console.error(error);
      showStatus('PDFの生成に失敗しました。時間をおいて再度お試しください。');
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

      <div className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
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
              className="border border-tanei-border rounded-tanei-control px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tanei-brand"
            >
              {FURNITURE_MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          {sheetLayout && sheets.length > 0 && (
            <div className="text-sm text-tanei-ink flex flex-wrap gap-x-4 gap-y-1">
              <span>
                板サイズ：<span className="font-bold">{sheetLayout.sheetWidthMm}×{sheetLayout.sheetHeightMm}mm</span>
              </span>
              <span>
                必要枚数：<span className="font-black text-tanei-brand">{sheets.length}枚</span>
              </span>
            </div>
          )}
        </div>

        {sheetLayout && sheets.length > 0 ? (
          <>
            <div>
              <h3 className="text-sm font-bold text-tanei-ink mb-1">木取り図</h3>
              <SheetLayoutSvgView layout={sheetLayout} showToast={showStatus} />
            </div>

            <div>
              <h3 className="text-sm font-bold text-tanei-ink mb-1">パーツ一覧</h3>
              <ul className="rounded-tanei-control border border-tanei-border divide-y divide-tanei-border overflow-hidden bg-white">
                {model.panels.map((panel) => (
                  <li key={panel.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-bold text-tanei-ink">{panel.label}</span>
                    <span className="text-tanei-ink-muted text-xs">
                      {Math.round(panel.size.x)} × {Math.round(panel.size.y)} × {Math.round(panel.size.z)} mm
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex-1 bg-tanei-brand text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors disabled:opacity-50"
              >
                {isGeneratingPdf ? 'PDFを作成中…' : '📄 PDFを保存'}
              </button>
              <button
                type="button"
                onClick={onOpenCutList}
                className="flex-1 bg-tanei-accent text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-accent-dark transition-colors"
              >
                📋 カットリストを見る
              </button>
            </div>

            <div id={BUILD_GUIDE_ANCHOR_ID}>
              <CadBuildGuide
                model={model}
                material={material}
                sheetLayout={sheetLayout}
                sheetCount={sheets.length}
                onViewPanel={onViewPanel}
                buildChecklist={buildChecklist}
                onViewBuildCheck={onViewBuildCheck}
              />
            </div>
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
