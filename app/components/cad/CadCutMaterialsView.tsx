'use client';

// 「カットリスト」画面（Phase 2-7）。木取り図（Phase 2-3〜2-4）だけでは初心者に
// 「結局何を何枚切ればいいのか」が伝わりにくいため、既存のPanel[]から同じ名称・同じ寸法の
// パーツをまとめ、「☐ 側板 864×300×18mm ×2」のようなチェックリストとして表示する。
// 新しい木取り計算・新しいパーツデータは作らず、既存のFurnitureModel.panelsを集計するだけ。
//
// ファイル名注意：既存の CadCutlistView.tsx（木取り図画面）と紛らわしいため、
// あえて CadCutMaterialsView.tsx という別名にしている
// （大文字小文字だけが違うファイル名はmacOSの大文字小文字を区別しないファイルシステムで
// 衝突するため、意図的に避けている）。

import { useMemo } from 'react';
import type { FurnitureModel } from '../../lib/cad/types';
import { buildCutListItems, furnitureModelToSheetLayout } from '../../lib/cad/model';

interface CadCutMaterialsViewProps {
  model: FurnitureModel;
  checked: Record<string, boolean>;
  onToggle: (itemId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function CadCutMaterialsView({ model, checked, onToggle, onBack, onNext }: CadCutMaterialsViewProps) {
  // カットリストは「木取り図が実際に作れる設計かどうか」を前提にする。木取り不能な
  // （どの定尺サイズにも収まらない）設計では、架空のカットリストを作らず案内文だけを出す
  const sheetLayout = useMemo(() => furnitureModelToSheetLayout(model), [model]);
  const items = useMemo(() => (sheetLayout ? buildCutListItems(model) : []), [model, sheetLayout]);

  const doneCount = items.filter((item) => checked[item.id]).length;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand"
        >
          ← 木取り図に戻る
        </button>

        <div>
          <p className="text-[11px] font-bold text-tanei-accent">STEP 4 / 6</p>
          <h2 className="text-lg font-black text-tanei-ink">カットする材料</h2>
          <p className="text-xs text-tanei-ink-muted mt-0.5">
            何を、どのサイズで、何枚カットすればいいかの一覧です。カットしたらチェックしましょう。
          </p>
        </div>

        {!sheetLayout || items.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-tanei-control px-4 py-3 text-sm">
            カットリストを作成するための設計情報が不足しています。
            <br />
            「← 木取り図に戻る」から、寸法や材料の設定をご確認ください。
          </div>
        ) : (
          <>
            <p className="text-sm text-tanei-ink">
              進捗：<span className="font-black text-tanei-brand">{doneCount} / {items.length}</span> 完了
            </p>

            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const isChecked = Boolean(checked[item.id]);
                return (
                  <li key={item.id}>
                    <label
                      className={`flex items-start gap-3 rounded-tanei-control border px-3 py-2.5 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-tanei-brand-soft border-tanei-brand'
                          : 'bg-white border-tanei-border hover:bg-tanei-surface'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggle(item.id)}
                        className="mt-0.5 h-4 w-4 accent-tanei-brand flex-shrink-0"
                      />
                      <span className="flex-1">
                        <span className={`block font-bold text-sm ${isChecked ? 'text-tanei-ink line-through' : 'text-tanei-ink'}`}>
                          {item.name}
                        </span>
                        <span className="block text-xs text-tanei-ink-muted mt-0.5">
                          {item.widthMm} × {item.heightMm} × {item.thicknessMm} mm　×{item.qty}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={onNext}
              className="bg-tanei-brand text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors"
            >
              次へ：制作チェックへ →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
