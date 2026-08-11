'use client';

// 「制作する」セクション。木取り図画面の続きとして、木取り図・パーツ一覧と同じ
// FurnitureModel（Panel[]）を唯一のデータソースに、初心者向けの制作リスト・作り方・
// 必要な工具・安全ポイントを表示する。AIによる自由生成やGemini APIは使わず、現在の
// 家具構造（背板・棚板・脚の有無）から機械的に判断できる範囲だけを文面に反映する。

import { useState } from 'react';
import type { FurnitureModel } from '../../lib/cad/types';
import type { SheetLayout } from '../../lib/sheetLayout';
import {
  BUILD_CHECKLIST_STEPS,
  FURNITURE_BUILD_TOOLS,
  buildFurnitureSteps,
  calculateMaterialCostEstimate,
  findMaterialPriceInfo,
  getNextBuildStep,
} from '../../lib/cad/model';
import { AMAZON_TOOLS } from '../../lib/constants';

// 「約1,200円〜」のような下限のみの表記と「約300〜500円」のような範囲表記の両方に対応する
const formatYenRange = (low: number, high: number | null): string =>
  high !== null ? `約${low.toLocaleString()}〜${high.toLocaleString()}円` : `約${low.toLocaleString()}円〜`;

// 「必要な工具」内の既存Amazonリンク一覧（Phase 2-8）へのスクロール先id。
// 買い物リストの「購入先を見る」から、新しいリンクを作らずここへ誘導するだけに使う
const AMAZON_TOOLS_ANCHOR_ID = 'cad-amazon-tools';

// 「制作前チェック」（Phase 3-7）の各項目から、既存の詳細セクションへページ内スクロール
// するためのid（Phase 3-8）。新しい画面・新しいviewModeは作らず、同じCadBuildGuide内の
// 既存セクションへ移動するだけに使う
const MATERIALS_ANCHOR_ID = 'cad-materials';
const TOOLS_ANCHOR_ID = 'cad-tools';
const PARTS_ANCHOR_ID = 'cad-parts';
const BUILD_STEPS_ANCHOR_ID = 'cad-build-steps';

interface CadBuildGuideProps {
  model: FurnitureModel;
  material: string;
  sheetLayout: SheetLayout;
  sheetCount: number;
  /** 「作るパーツ」の「このパーツを見る」から、既存の3D CADへ該当パーツを
   * ハイライトした状態で移動する（Phase 3-2） */
  onViewPanel: (panelId: string) => void;
  /** 制作チェック（Phase 2-7）のチェック状態。ここでは表示専用で、チェックの追加・変更は
   * 既存のCadBuildChecklistViewからのみ行う（Phase 3-5） */
  buildChecklist: Record<string, boolean>;
  /** 「制作チェックを見る」から、既存のviewMode切り替えでCadBuildChecklistViewへ戻る */
  onViewBuildCheck: () => void;
}

const SAFETY_NOTES = [
  '作業を始める前に、工具の取扱説明書を確認してください。',
  '木材を切るときは保護メガネを使用してください。',
  '材料はクランプ等でしっかり固定してから加工してください。',
  'ビスを打つ前に、割れ防止の下穴を確認してください。',
  '刃物や電動工具の進行方向に手を置かないでください。',
  '安全第一で、無理のない範囲で作業してください。',
];

export default function CadBuildGuide({
  model,
  material,
  sheetLayout,
  sheetCount,
  onViewPanel,
  buildChecklist,
  onViewBuildCheck,
}: CadBuildGuideProps) {
  const steps = buildFurnitureSteps(model.panels);
  // 制作チェック（Phase 2-7）と全く同じ関数・同じデータを使い、進捗表示が食い違わないようにする
  const buildDoneCount = BUILD_CHECKLIST_STEPS.filter((_, i) => buildChecklist[String(i + 1)]).length;
  const buildPercent = Math.round((buildDoneCount / BUILD_CHECKLIST_STEPS.length) * 100);
  const nextBuildStep = getNextBuildStep(buildChecklist);
  // 既存のAIチャット用木材価格目安リスト（app/lib/constants.ts）から、現在選択中の材料と
  // 名前が一致するものだけを表示する。一致しなければ「価格情報なし」と正直に表示する
  const priceInfo = findMaterialPriceInfo(material);
  // 木取り図（sheetLayout）が既にここまで生成できている＝木取り可能な状態でのみ
  // CadBuildGuideが描画されるため、必要枚数（sheetCount）は常に既存の木取りデータそのまま
  const costEstimate = calculateMaterialCostEstimate(material, sheetCount);

  // 買い物リストのチェック状態は、このセクション内だけの一時的な表示用状態。
  // IndexedDB・SavedFurnitureProjectには一切保存せず、リロードすれば初期状態に戻る
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(true);
  const [checkedShoppingItems, setCheckedShoppingItems] = useState<Record<string, boolean>>({});
  const toggleShoppingItem = (key: string) => {
    setCheckedShoppingItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 「作り方」の開閉状態（Phase 3-6）。最初のステップだけ開いた状態で始める、
  // 表示専用の一時的なUI状態（保存しない）。9ステップの内容・順序・生成ロジックは
  // buildFurnitureSteps()から一切変更していない
  const [expandedStepNumber, setExpandedStepNumber] = useState<number | null>(1);
  const toggleStep = (stepNumber: number) => {
    setExpandedStepNumber((prev) => (prev === stepNumber ? null : stepNumber));
  };

  // 「制作前チェック」から既存セクションへのページ内スクロール（Phase 3-8）。
  // ブラウザ標準のscrollIntoViewのみを使い、新しい画面遷移は発生させない
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col gap-4 border-t border-tanei-border pt-4">
      <div>
        <h2 className="text-lg font-black text-tanei-ink">制作する</h2>
        <p className="text-xs text-tanei-ink-muted mt-0.5">
          この家具を作るために必要なもの・作り方をまとめています
        </p>
      </div>

      <div className="rounded-tanei-control border border-tanei-border bg-white p-3">
        <span className="text-xs font-bold text-tanei-ink-muted">制作前チェック</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <div className="rounded-tanei-control bg-tanei-surface px-2.5 py-2 flex flex-col items-center gap-1">
            <span className="text-[11px] text-tanei-ink-muted">材料</span>
            <span className="text-base font-black text-tanei-brand">{sheetCount}枚</span>
            <button
              type="button"
              onClick={() => scrollToSection(MATERIALS_ANCHOR_ID)}
              className="text-[10px] font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
            >
              材料を見る
            </button>
          </div>
          <div className="rounded-tanei-control bg-tanei-surface px-2.5 py-2 flex flex-col items-center gap-1">
            <span className="text-[11px] text-tanei-ink-muted">工具</span>
            <span className="text-base font-black text-tanei-brand">{FURNITURE_BUILD_TOOLS.length}種類</span>
            <button
              type="button"
              onClick={() => scrollToSection(TOOLS_ANCHOR_ID)}
              className="text-[10px] font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
            >
              工具を見る
            </button>
          </div>
          <div className="rounded-tanei-control bg-tanei-surface px-2.5 py-2 flex flex-col items-center gap-1">
            <span className="text-[11px] text-tanei-ink-muted">パーツ</span>
            <span className="text-base font-black text-tanei-brand">{model.panels.length}個</span>
            <button
              type="button"
              onClick={() => scrollToSection(PARTS_ANCHOR_ID)}
              className="text-[10px] font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
            >
              パーツを見る
            </button>
          </div>
          <div className="rounded-tanei-control bg-tanei-surface px-2.5 py-2 flex flex-col items-center gap-1">
            <span className="text-[11px] text-tanei-ink-muted">作り方</span>
            <span className="text-base font-black text-tanei-brand">{steps.length}ステップ</span>
            <button
              type="button"
              onClick={() => scrollToSection(BUILD_STEPS_ANCHOR_ID)}
              className="text-[10px] font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
            >
              作り方を見る
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-tanei-border text-center">
          <p className="text-xs font-bold text-tanei-ink">準備ができたら制作を開始</p>
          <p className="text-[11px] text-tanei-ink-muted mt-0.5 mb-2">
            材料・工具・パーツ・作り方を確認したら、制作を始めましょう。
          </p>
          <button
            type="button"
            onClick={onViewBuildCheck}
            className="w-full sm:w-auto bg-tanei-brand text-white text-sm font-bold px-6 py-2.5 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
          >
            {!nextBuildStep ? '✓ 制作完了を見る' : buildDoneCount > 0 ? '制作を続ける' : '制作を開始する'}
          </button>
        </div>
      </div>

      <div className="rounded-tanei-control border border-tanei-border bg-white p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-tanei-ink-muted">制作進捗</span>
          <span className="text-sm font-black text-tanei-brand">
            {buildDoneCount} / {BUILD_CHECKLIST_STEPS.length}（{buildPercent}%）
          </span>
        </div>
        <div className="w-full bg-tanei-border h-2 rounded-full overflow-hidden">
          <div className="bg-tanei-brand h-full transition-all duration-300" style={{ width: `${buildPercent}%` }} />
        </div>
        {nextBuildStep ? (
          <p className="text-xs text-tanei-ink">
            次にやること：<span className="font-bold">{nextBuildStep.label}</span>
          </p>
        ) : (
          <p className="text-xs font-bold text-tanei-brand">✓ 制作完了</p>
        )}
        <button
          type="button"
          onClick={onViewBuildCheck}
          className="self-start text-xs font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
        >
          制作チェックを見る
        </button>
      </div>

      <div>
        <h3 id={MATERIALS_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">必要な材料</h3>
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

      <div className="rounded-tanei-control border border-tanei-border bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setIsShoppingListOpen((prev) => !prev)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-sm font-bold text-tanei-ink">🛒 買い物リスト</span>
          <span className="text-xs text-tanei-ink-muted">{isShoppingListOpen ? '閉じる ▲' : '開く ▼'}</span>
        </button>

        {isShoppingListOpen && (
          <div className="px-3 pb-3 flex flex-col gap-3 border-t border-tanei-border pt-3">
            <div>
              <h4 className="text-xs font-bold text-tanei-ink-muted mb-1">材料</h4>
              <ul className="rounded-tanei-control border border-tanei-border divide-y divide-tanei-border overflow-hidden">
                {(() => {
                  const key = `material:${material}`;
                  const isChecked = Boolean(checkedShoppingItems[key]);
                  return (
                    <li>
                      <label
                        className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          isChecked ? 'bg-tanei-brand-soft' : 'bg-white hover:bg-tanei-surface'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleShoppingItem(key)}
                          className="mt-0.5 h-4 w-4 accent-tanei-brand flex-shrink-0"
                        />
                        <span className="flex-1 text-xs">
                          <span className={`block font-bold ${isChecked ? 'text-tanei-ink line-through' : 'text-tanei-ink'}`}>
                            {material}　×{sheetCount}枚
                          </span>
                          <span className="block text-tanei-ink-muted mt-0.5">
                            サイズ：{sheetLayout.sheetWidthMm} × {sheetLayout.sheetHeightMm} mm
                          </span>
                          <span className="block text-tanei-ink-muted mt-0.5">
                            {costEstimate
                              ? `価格目安：${formatYenRange(costEstimate.totalLow, costEstimate.totalHigh)}`
                              : '参考価格データなし'}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })()}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-tanei-ink-muted mb-1">工具</h4>
              <ul className="rounded-tanei-control border border-tanei-border divide-y divide-tanei-border overflow-hidden">
                {FURNITURE_BUILD_TOOLS.map((tool) => {
                  const key = `tool:${tool}`;
                  const isChecked = Boolean(checkedShoppingItems[key]);
                  return (
                    <li key={tool}>
                      <label
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          isChecked ? 'bg-tanei-brand-soft' : 'bg-white hover:bg-tanei-surface'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleShoppingItem(key)}
                          className="h-4 w-4 accent-tanei-brand flex-shrink-0"
                        />
                        <span className={`text-xs font-bold ${isChecked ? 'text-tanei-ink line-through' : 'text-tanei-ink'}`}>
                          {tool}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <a
                href={`#${AMAZON_TOOLS_ANCHOR_ID}`}
                className="inline-block mt-1.5 text-xs font-bold text-tanei-brand hover:text-tanei-brand-dark"
              >
                🛒 購入先を見る
              </a>
            </div>

            <p className="text-[10px] text-tanei-ink-muted leading-relaxed">
              ※チェック状態は保存されません。価格は参考値です。ビス・ボンド・塗料などの副資材や工具の価格は含みません。
            </p>
          </div>
        )}
      </div>

      <div>
        <h3 id={PARTS_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">作るパーツ</h3>
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
        <h3 id={TOOLS_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">必要な工具</h3>
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

        <h3 id={AMAZON_TOOLS_ANCHOR_ID} className="text-xs font-bold text-tanei-ink-muted mt-3 mb-1">🛒 工具を購入する（とみしんチャンネルおすすめ）</h3>
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
        <h3 id={BUILD_STEPS_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-2 scroll-mt-4">作り方</h3>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => {
            const isExpanded = expandedStepNumber === step.stepNumber;
            const panelId = `cad-build-step-panel-${step.stepNumber}`;
            return (
              <li
                key={step.stepNumber}
                className="rounded-tanei-control border border-tanei-border bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleStep(step.stepNumber)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-tanei-brand"
                >
                  <span className="flex-shrink-0 bg-tanei-brand text-white text-xs font-black w-7 h-7 rounded-full flex items-center justify-center">
                    {step.stepNumber}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10px] font-bold text-tanei-accent">STEP {step.stepNumber}</span>
                    <span className="block font-bold text-sm text-tanei-ink break-words">{step.title}</span>
                  </span>
                  <span className="flex-shrink-0 text-xs text-tanei-ink-muted" aria-hidden="true">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>
                {isExpanded && (
                  <p id={panelId} className="text-xs text-tanei-ink-muted px-3 pb-3 ml-10 leading-relaxed break-words">
                    {step.description}
                  </p>
                )}
              </li>
            );
          })}
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
