'use client';

// 「木取り図」画面。CADで設計した家具（FurnitureModel）から、既存の木取り計算
// エンジン（app/lib/sheetLayout.ts）・SVG表示（SheetLayoutSvg.tsx）・PDF生成
// （app/lib/cutSheetPdf.ts）をそのまま再利用して、実際にホームセンターへ持って
// いけるカット依頼書まで作れるようにする。新しい木取り計算ロジックは作らない。
//
// 「CAD」「Panel」「SheetLayout」といった開発者向けの言葉は画面に出さず、
// 「設計」「材料」「木取り図」という言葉だけを使う。

import { useMemo, useState } from 'react';
import { packSheetLayout } from '../../lib/sheetLayout';
import SheetLayoutSvgView from '../chat/SheetLayoutSvg';
import { buildUniversalCutSheetPdf } from '../../lib/cutSheetPdf';
import { downloadPdfBytes } from '../../lib/download';
import type { FurnitureModel } from '../../lib/cad/types';
import { FURNITURE_MATERIALS, furnitureModelToSheetLayout } from '../../lib/cad/model';

interface CadCutlistViewProps {
  model: FurnitureModel;
  material: string;
  onMaterialChange: (material: string) => void;
  onBack: () => void;
}

export default function CadCutlistView({ model, material, onMaterialChange, onBack }: CadCutlistViewProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sheetLayout = useMemo(() => furnitureModelToSheetLayout(model), [model]);
  const sheets = useMemo(() => (sheetLayout ? packSheetLayout(sheetLayout) : []), [sheetLayout]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleDownloadPdf = async () => {
    if (!sheetLayout) return;
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await buildUniversalCutSheetPdf([], [sheetLayout]);
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

        <label className="flex flex-col gap-1 max-w-xs">
          <span className="text-xs font-bold text-tanei-ink-muted">使用材料</span>
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

        {sheetLayout && sheets.length > 0 ? (
          <>
            <p className="text-sm text-tanei-ink">
              必要枚数：<span className="font-black text-tanei-brand">{sheets.length}枚</span>
              　（{sheetLayout.sheetWidthMm}×{sheetLayout.sheetHeightMm}mm）
            </p>

            <SheetLayoutSvgView layout={sheetLayout} showToast={showStatus} />

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="bg-tanei-brand text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors disabled:opacity-50"
            >
              {isGeneratingPdf ? 'PDFを作成中…' : '📄 PDFを保存'}
            </button>
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
