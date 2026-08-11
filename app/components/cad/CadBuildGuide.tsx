'use client';

// 「制作する」セクション。木取り図画面の続きとして、木取り図・パーツ一覧と同じ
// FurnitureModel（Panel[]）を唯一のデータソースに、初心者向けの制作リスト・作り方・
// 必要な工具・安全ポイントを表示する。AIによる自由生成やGemini APIは使わず、現在の
// 家具構造（背板・棚板・脚の有無）から機械的に判断できる範囲だけを文面に反映する。

import type { FurnitureModel } from '../../lib/cad/types';
import type { SheetLayout } from '../../lib/sheetLayout';
import {
  FURNITURE_BUILD_TOOLS,
  buildFurnitureSteps,
  calculateMaterialCostEstimate,
  findMaterialPriceInfo,
} from '../../lib/cad/model';
import { AMAZON_TOOLS } from '../../lib/constants';

// 「約1,200円〜」のような下限のみの表記と「約300〜500円」のような範囲表記の両方に対応する
const formatYenRange = (low: number, high: number | null): string =>
  high !== null ? `約${low.toLocaleString()}〜${high.toLocaleString()}円` : `約${low.toLocaleString()}円〜`;

interface CadBuildGuideProps {
  model: FurnitureModel;
  material: string;
  sheetLayout: SheetLayout;
  sheetCount: number;
  /** 「作るパーツ」の「このパーツを見る」から、既存の3D CADへ該当パーツを
   * ハイライトした状態で移動する（Phase 3-2） */
  onViewPanel: (panelId: string) => void;
}

const SAFETY_NOTES = [
  '作業を始める前に、工具の取扱説明書を確認してください。',
  '木材を切るときは保護メガネを使用してください。',
  '材料はクランプ等でしっかり固定してから加工してください。',
  'ビスを打つ前に、割れ防止の下穴を確認してください。',
  '刃物や電動工具の進行方向に手を置かないでください。',
  '安全第一で、無理のない範囲で作業してください。',
];

export default function CadBuildGuide({ model, material, sheetLayout, sheetCount, onViewPanel }: CadBuildGuideProps) {
  const steps = buildFurnitureSteps(model.panels);
  // 既存のAIチャット用木材価格目安リスト（app/lib/constants.ts）から、現在選択中の材料と
  // 名前が一致するものだけを表示する。一致しなければ「価格情報なし」と正直に表示する
  const priceInfo = findMaterialPriceInfo(material);
  // 木取り図（sheetLayout）が既にここまで生成できている＝木取り可能な状態でのみ
  // CadBuildGuideが描画されるため、必要枚数（sheetCount）は常に既存の木取りデータそのまま
  const costEstimate = calculateMaterialCostEstimate(material, sheetCount);

  return (
    <div className="flex flex-col gap-4 border-t border-tanei-border pt-4">
      <div>
        <h2 className="text-lg font-black text-tanei-ink">制作する</h2>
        <p className="text-xs text-tanei-ink-muted mt-0.5">
          この家具を作るために必要なもの・作り方をまとめています
        </p>
      </div>

      <div>
        <h3 className="text-sm font-bold text-tanei-ink mb-1">必要な材料</h3>
        <div className="rounded-tanei-control border border-tanei-border bg-white px-3 py-2 text-sm text-tanei-ink flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-bold">{material}</span>
          <span>{sheetLayout.sheetWidthMm} × {sheetLayout.sheetHeightMm} mm</span>
          <span>
            必要枚数：<span className="font-black text-tanei-brand">{sheetCount}枚</span>
          </span>
        </div>

        <h3 className="text-xs font-bold text-tanei-ink-muted mt-2 mb-1">価格目安（コーナン）</h3>
        {priceInfo.length > 0 ? (
          <div className="rounded-tanei-control border border-tanei-border bg-white divide-y divide-tanei-border overflow-hidden">
            {priceInfo.map((wood) => (
              <div key={wood.name} className="px-3 py-2 text-xs text-tanei-ink">
                <span className="font-bold text-tanei-brand">{wood.name}</span>
                <span className="text-tanei-ink-muted"> ／ {wood.size} ／ {wood.length}</span>
                <div className="text-tanei-ink-muted mt-0.5">目安：{wood.price}（{wood.feature}）</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-tanei-ink-muted">価格情報なし</p>
        )}

        <h3 className="text-xs font-bold text-tanei-ink-muted mt-3 mb-1">材料費の目安</h3>
        {costEstimate ? (
          <div className="rounded-tanei-control border border-tanei-border bg-white overflow-hidden">
            <div className="divide-y divide-tanei-border">
              {costEstimate.items.map((item) => (
                <div key={item.name} className="px-3 py-2 text-xs text-tanei-ink flex items-center justify-between gap-2">
                  <span className="text-tanei-ink-muted">{item.name}（{item.quantity}枚）</span>
                  <span className="font-bold text-tanei-ink">{formatYenRange(item.subtotalLow, item.subtotalHigh)}</span>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 bg-tanei-brand-soft flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-tanei-ink">材料費合計の目安</span>
              <span className="text-sm font-black text-tanei-brand">
                {formatYenRange(costEstimate.totalLow, costEstimate.totalHigh)}
              </span>
            </div>
            <p className="px-3 py-2 text-[10px] text-tanei-ink-muted leading-relaxed">
              ※価格は参考値です。実際の価格は店舗・サイズ・時期などにより異なります。ビス・ボンド・塗料などの副資材は含みません。
            </p>
          </div>
        ) : (
          <p className="text-xs text-tanei-ink-muted">参考価格データがありません</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-tanei-ink mb-1">作るパーツ</h3>
        <ul className="rounded-tanei-control border border-tanei-border divide-y divide-tanei-border overflow-hidden bg-white">
          {model.panels.map((panel) => (
            <li key={panel.id} className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-tanei-ink">{panel.label}</span>
                <span className="text-tanei-ink-muted text-xs">
                  {Math.round(panel.size.x)} × {Math.round(panel.size.y)} × {Math.round(panel.size.z)} mm
                </span>
              </div>
              <button
                type="button"
                onClick={() => onViewPanel(panel.id)}
                className="self-start text-xs font-bold text-tanei-brand border border-tanei-brand/40 hover:bg-tanei-brand-soft hover:border-tanei-brand rounded-full px-3 py-1 transition-colors"
              >
                👁 このパーツを見る
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-bold text-tanei-ink mb-1">必要な工具</h3>
        <ul className="flex flex-wrap gap-2">
          {FURNITURE_BUILD_TOOLS.map((tool) => (
            <li
              key={tool}
              className="bg-tanei-brand-soft text-tanei-ink text-xs font-bold px-3 py-1.5 rounded-full border border-tanei-brand/30"
            >
              {tool}
            </li>
          ))}
        </ul>

        <h3 className="text-xs font-bold text-tanei-ink-muted mt-3 mb-1">🛒 工具を購入する（とみしんチャンネルおすすめ）</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {AMAZON_TOOLS.map((tool) => (
            <a
              key={tool.name}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 bg-white p-2 rounded-tanei-control border border-tanei-border hover:border-[#FF9900] transition-all"
            >
              <span className="text-xs font-bold text-tanei-ink truncate">{tool.name}</span>
              <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded flex-shrink-0 font-bold">
                Amazon ＞
              </span>
            </a>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-tanei-ink mb-2">作り方</h3>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => (
            <li
              key={step.stepNumber}
              className="rounded-tanei-control border border-tanei-border bg-white px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 bg-tanei-brand text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">
                  {step.stepNumber}
                </span>
                <span className="font-bold text-sm text-tanei-ink">{step.title}</span>
              </div>
              <p className="text-xs text-tanei-ink-muted mt-1 ml-8">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-sm font-bold text-tanei-ink mb-1">安全ポイント</h3>
        <ul className="rounded-tanei-control border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex flex-col gap-1.5">
          {SAFETY_NOTES.map((note) => (
            <li key={note} className="flex gap-1.5">
              <span>⚠️</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
