'use client';

// 「制作する」セクション。木取り図画面の続きとして、木取り図・パーツ一覧と同じ
// FurnitureModel（Panel[]）を唯一のデータソースに、初心者向けの制作リスト・作り方・
// 必要な工具・安全ポイントを表示する。AIによる自由生成やGemini APIは使わず、現在の
// 家具構造（背板・棚板・脚の有無）から機械的に判断できる範囲だけを文面に反映する。

import { useState } from 'react';
import type { FurnitureModel, FurniturePanel } from '../../lib/cad/types';
import type { SheetLayout } from '../../lib/sheetLayout';
import {
  BUILD_CHECKLIST_STEPS,
  CUT_LIST_KIND_NAME,
  FURNITURE_BUILD_TOOLS,
  buildFurnitureSteps,
  calculateMaterialCostEstimate,
  findMaterialPriceInfo,
  getNextBuildStep,
} from '../../lib/cad/model';
import { AMAZON_TOOLS } from '../../lib/constants';

/** 「作り方」の各ステップから「使用するパーツ」を特定する（Phase 3-26）。
 * AIによる推測は行わず、既存のCUT_LIST_KIND_NAME（カットリストと共通の名称対応表）に
 * 載っている部材名が、そのステップのdescription文にそのまま登場する場合だけを対象にする
 * （'custom'種類のパーツは対応する名称が無いため、常に対象外＝安全側に倒れる）。
 * サイズの求め方も既存のbuildCutListItems()と全く同じ「3辺をソートして幅・奥行・厚みとする」
 * 方式を再利用し、新しい寸法計算は行わない */
interface StepPartGroup {
  key: string;
  name: string;
  count: number;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  representativePanelId: string;
}

function findStepPartGroups(panels: FurniturePanel[], description: string): StepPartGroup[] {
  const groups = new Map<string, StepPartGroup>();
  panels.forEach((panel) => {
    const name = CUT_LIST_KIND_NAME[panel.kind];
    if (!name || !description.includes(name)) return;
    const dims = [panel.size.x, panel.size.y, panel.size.z].sort((a, b) => a - b);
    const thicknessMm = Math.round(dims[0]);
    const heightMm = Math.round(dims[1]);
    const widthMm = Math.round(dims[2]);
    const key = `${name}__${widthMm}x${heightMm}x${thicknessMm}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { key, name, count: 1, widthMm, heightMm, thicknessMm, representativePanelId: panel.id });
    }
  });
  return Array.from(groups.values());
}

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
// 制作チェックの「仕上げを行った」からの確認導線（Phase 3-10）のスクロール先
const SAFETY_NOTES_ANCHOR_ID = 'cad-safety-notes';
// 制作チェックの制作ナビ（Phase 3-12）の「買い物リスト」からのスクロール先（Phase 3-23）
const SHOPPING_LIST_ANCHOR_ID = 'cad-shopping-list';
// 製作チェック（10項目、CadCutlistView.tsx側に統合済み）へのスクロール先id。
// 以前は別画面（CadBuildChecklistView.tsx、viewMode='buildCheck'）への画面遷移だったが、
// 木取り図ページ内に統合したため、同じページ内スクロールに変わった。CadCutlistView.tsx側の
// 同名定数と値を一致させる必要があるが、既存の他のanchor id定数と同じく、importで結合を
// 強めるのではなく値だけを再利用する（既存方針を踏襲） */
const BUILD_CHECKLIST_ANCHOR_ID = 'cad-build-checklist';

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
  /** 「作り方」9STEPそれぞれのチェック状態。buildChecklist（制作チェック10項目）とは
   * 独立した、STEPごとの完了状態。キーはSTEP番号（1〜9）の文字列 */
  buildGuideChecked: Record<string, boolean>;
  /** STEPのチェックボックスから呼ばれる。CadStudio.tsxのbuildGuideCheckedを更新する */
  onToggleBuildGuideStep: (step: number) => void;
  /** 「制作準備」（Phase「1ページ縦スクロール型」）のチェックボックスから呼ばれる。
   * buildChecklistの特定キーを直接トグルする、CadCutlistView.tsxと同じ仕組み */
  onToggleBuildChecklistKey: (key: string) => void;
}

// 「制作準備」（材料・工具・安全）の3項目。チェックがすべて揃うまで「作り方」を
// ロックする（指示⑦⑧）。保存先はbuildChecklistの既存キー・新規キーを混在させる
// （案A：既存の「1. 材料を用意した」はそのまま流用し、対応項目の無い工具・安全だけ
// 新しい文字列キーを追加する。Record<string,boolean>のため既存データへの影響はない）
const PREP_MATERIAL_KEY = '1';
const PREP_TOOLS_KEY = 'tools_ready';
const PREP_SAFETY_KEY = 'safety_confirmed';
const PREP_CHECKLIST_ITEMS = [
  { key: PREP_MATERIAL_KEY, label: '材料を用意した' },
  { key: PREP_TOOLS_KEY, label: '工具を用意した' },
  { key: PREP_SAFETY_KEY, label: '安全確認をした（保護メガネ・作業場所の確保など）' },
] as const;
const PREP_ANCHOR_ID = 'cad-build-prep';

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
  buildGuideChecked,
  onToggleBuildGuideStep,
  onToggleBuildChecklistKey,
}: CadBuildGuideProps) {
  const isPrepComplete = PREP_CHECKLIST_ITEMS.every((item) => Boolean(buildChecklist[item.key]));
  const steps = buildFurnitureSteps(model.panels, model.thickness);
  // 制作チェック（Phase 2-7）と全く同じ関数・同じデータを使い、進捗表示が食い違わないようにする。
  // この「制作進捗」カード自体は10項目の制作チェックの全体進捗を示すもので、
  // 下記のSTEPごとのチェック（buildGuideChecked）とは独立して維持する
  const buildDoneCount = BUILD_CHECKLIST_STEPS.filter((_, i) => buildChecklist[String(i + 1)]).length;
  const buildPercent = Math.round((buildDoneCount / BUILD_CHECKLIST_STEPS.length) * 100);
  const nextBuildStep = getNextBuildStep(buildChecklist);

  // 「作り方」9ステップの「現在の作業」表示。各STEPカードに追加したチェックボックス
  // （buildGuideChecked、制作チェック10項目のbuildChecklistとは別の独立した状態）から、
  // 最初にチェックが入っていないSTEPを「現在の作業」として求める
  const guideDoneCount = steps.filter((s) => buildGuideChecked[String(s.stepNumber)]).length;
  const currentBuildStepNumber = steps.find((s) => !buildGuideChecked[String(s.stepNumber)])?.stepNumber ?? null;
  const isBuildStepDone = (stepNumber: number) => Boolean(buildGuideChecked[String(stepNumber)]);

  // 「作り方の進捗」サマリー（Phase 3-34）。新しい保存データは作らず、既存の
  // isBuildStepDone・steps.lengthから毎回算出するだけ
  const completedStepCount = guideDoneCount;
  const stepProgressPercent = Math.round((completedStepCount / steps.length) * 100);

  // 「作り方」と制作チェックの関連表示（Phase 3-26）。既存のCONFIRM_TARGETS
  // （CadBuildChecklistView.tsx、Phase 3-10）では、チェック項目6「組み立て位置を確認した」〜
  // 9「ガタつきを確認した」の4件が、個別のステップ番号にではなく、まとめて「作り方を見る」
  // （BUILD_STEPS_ANCHOR_ID）というセクション全体に対応付けられている。9ステップと10項目は
  // 完全な1対1対応ではないため、この4件のどれが具体的にどのステップに対応するかという
  // 新しい対応表は作らない。代わりに、この4件（既存コードで確認できる、作り方に関連する
  // 範囲）の完了状況を集計するだけにとどめ、Phase 3-25の「現在の作業」ステップ
  // （currentBuildStepNumber、全完了時は最後のステップ）が6〜9の範囲にある場合だけ、
  // そのステップ1箇所にのみ表示する（情報が過密にならないよう、常に最大1箇所）
  const BUILD_STEP_RELATED_CHECKLIST_ITEMS = [6, 7, 8, 9] as const;
  const relatedChecklistDoneCount = BUILD_STEP_RELATED_CHECKLIST_ITEMS.filter(
    (n) => buildChecklist[String(n)]
  ).length;
  const relatedChecklistTotal = BUILD_STEP_RELATED_CHECKLIST_ITEMS.length;
  const checklistRelationStepNumber = currentBuildStepNumber ?? steps.length;
  const showChecklistRelation = (BUILD_STEP_RELATED_CHECKLIST_ITEMS as readonly number[]).includes(
    checklistRelationStepNumber
  );

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

  // 「作り方」の開閉状態（Phase 3-6）。表示専用の一時的なUI状態（保存しない）。9ステップの
  // 内容・順序・生成ロジックはbuildFurnitureSteps()から一切変更していない。
  // Phase 3-25：初期表示は「現在の作業」に該当するステップを開いた状態にする
  // （無ければステップ1）。マウント時の初期値だけに使い、その後チェックを付けても
  // ユーザーが開閉した状態を勝手に変えないようにするため、依存配列は空のままにする
  const [expandedStepNumber, setExpandedStepNumber] = useState<number | null>(
    () => currentBuildStepNumber ?? 1
  );
  const toggleStep = (stepNumber: number) => {
    setExpandedStepNumber((prev) => (prev === stepNumber ? null : stepNumber));
  };

  // 「制作前チェック」から既存セクションへのページ内スクロール（Phase 3-8）。
  // ブラウザ標準のscrollIntoViewのみを使い、新しい画面遷移は発生させない
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 「作り方」STEPの前後ナビゲーション（Phase 3-29）。新しいSTEPデータ構造は作らず、
  // 既存のstepNumberとscrollToSection（Phase 3-8と全く同じscrollIntoViewだけの仕組み）を
  // 再利用するだけ。移動先のSTEPを開いた状態にして分かりやすくするが、buildChecklist・
  // cutListChecked・currentBuildStepNumberの判定ロジックには一切触れない
  const goToBuildStep = (stepNumber: number) => {
    setExpandedStepNumber(stepNumber);
    scrollToSection(`cad-build-step-${stepNumber}`);
  };

  // STEPのチェックボックス。未完了→完了に変わった瞬間だけ、次のSTEPがあれば
  // 既存のgoToBuildStep（開閉状態変更＋scrollIntoViewの仕組みを流用するだけ）で
  // 自動的に次のSTEPへ移動する。完了→未完了に戻す場合や、最後のSTEPでは移動しない
  const handleToggleStepDone = (stepNumber: number) => {
    const wasDone = isBuildStepDone(stepNumber);
    onToggleBuildGuideStep(stepNumber);
    if (!wasDone && stepNumber < steps.length) {
      goToBuildStep(stepNumber + 1);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-tanei-border pt-4">
      <div>
        <h2 className="text-lg font-black text-tanei-ink">製作する</h2>
        <p className="text-xs text-tanei-ink-muted mt-0.5">
          この家具を作るために必要なもの・作り方をまとめています
        </p>
      </div>

      <div className="rounded-tanei-control border border-tanei-border bg-white p-3">
        <span className="text-xs font-bold text-tanei-ink-muted">製作前チェック</span>
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
      </div>

      <div className="rounded-tanei-control border border-tanei-border bg-white p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-tanei-ink-muted">製作進捗</span>
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
          <p className="text-xs font-bold text-tanei-brand">✓ 製作完了</p>
        )}
        <button
          type="button"
          onClick={() => scrollToSection(BUILD_CHECKLIST_ANCHOR_ID)}
          className="self-start text-xs font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
        >
          製作チェックを見る
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

      <div id={SHOPPING_LIST_ANCHOR_ID} className="rounded-tanei-control border border-tanei-border bg-white overflow-hidden scroll-mt-4">
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

      {/* 「制作準備」（指示⑦⑧）。材料・工具・安全の3項目をすべてチェックするまで、
          下の「作り方」をロックする。既存の「必要な材料」「必要な工具」「買い物リスト」
          セクションは削除せず、詳しい情報はそのまま残しつつ、ここではチェックボックス
          だけに絞ったシンプルな確認欄にする */}
      <div id={PREP_ANCHOR_ID} className="scroll-mt-4">
        <h3 className="text-sm font-bold text-tanei-ink mb-1">③ 製作準備</h3>
        <p className="text-xs text-tanei-ink-muted mb-2">作り始める前に、材料・工具・安全を確認してください。</p>
        <ul className="rounded-tanei-control border border-tanei-border divide-y divide-tanei-border overflow-hidden bg-white">
          {PREP_CHECKLIST_ITEMS.map((item) => {
            const isItemChecked = Boolean(buildChecklist[item.key]);
            return (
              <li key={item.key}>
                <label
                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                    isItemChecked ? 'bg-tanei-brand-soft' : 'bg-white hover:bg-tanei-surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isItemChecked}
                    onChange={() => onToggleBuildChecklistKey(item.key)}
                    className="h-4 w-4 accent-tanei-brand flex-shrink-0"
                  />
                  <span className={`text-sm font-bold ${isItemChecked ? 'text-tanei-ink line-through' : 'text-tanei-ink'}`}>
                    {item.label}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {isPrepComplete && <p className="text-xs font-bold text-tanei-brand mt-1.5">✓ 製作準備完了！</p>}
      </div>

      <div>
        <h3 id={BUILD_STEPS_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-2 scroll-mt-4">④ 作り方</h3>

        {!isPrepComplete ? (
          <div className="rounded-tanei-control border border-tanei-border bg-tanei-surface-muted px-4 py-6 text-center">
            <p className="text-sm font-bold text-tanei-ink-muted">🔒 製作準備が完了すると作り方を開始できます</p>
            <button
              type="button"
              onClick={() => scrollToSection(PREP_ANCHOR_ID)}
              className="mt-2 text-xs font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
            >
              ↑ 製作準備を確認する
            </button>
          </div>
        ) : (
          <>
        {/* 「作り方の進捗」サマリー（Phase 3-34）。既存のisBuildStepDone・
            currentBuildStepNumberから毎回算出するだけの表示・ナビゲーション専用ブロック。
            新しい保存データ・新しいSTEP↔チェック項目対応表は一切作らない */}
        <div id="cad-build-steps-progress" className="rounded-tanei-control border border-tanei-border bg-white p-3 mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-tanei-ink-muted">作り方の進捗</span>
            <span className="text-sm font-black text-tanei-brand">
              {completedStepCount === steps.length && '✓ '}
              {completedStepCount} / {steps.length} STEP完了
            </span>
          </div>
          <div className="w-full bg-tanei-border h-2 rounded-full overflow-hidden mt-1.5">
            <div
              className="bg-tanei-brand h-full transition-all duration-300"
              style={{ width: `${stepProgressPercent}%` }}
            />
          </div>
          {currentBuildStepNumber ? (
            <p className="text-xs text-tanei-ink mt-1.5">
              現在：<span className="font-bold">STEP {currentBuildStepNumber}</span>
            </p>
          ) : (
            <p className="text-xs font-bold text-tanei-brand mt-1.5">✓ すべてのSTEPが完了しています</p>
          )}
          {/* 「次にやるSTEP」（Phase 3-35）。新しいSTEP判定は作らず、「現在：STEP N」・
              ミニSTEPナビの強調と全く同じcurrentBuildStepNumberを唯一の判定元として使う */}
          {currentBuildStepNumber && (() => {
            // 既存のsteps配列から対象STEPを取得するだけ。新しいSTEPデータ構造は作らない（Phase 3-36）
            const currentBuildStep = steps.find((s) => s.stepNumber === currentBuildStepNumber);
            return (
              <div className="rounded-tanei-control bg-tanei-surface-muted border border-tanei-border px-2.5 py-2 mt-2">
                <p className="text-[11px] font-bold text-tanei-ink-muted mb-1">次にやるSTEP</p>
                <p className="text-xs font-bold text-tanei-ink break-words">
                  STEP {currentBuildStepNumber}　{currentBuildStep?.title}
                </p>
                {/* STEPカード側の説明文（step.description）と全く同じ文章をそのまま表示するだけ。
                    AI要約・書き換え・独自生成は一切行わない（Phase 3-36） */}
                {currentBuildStep && (
                  <p className="text-[11px] text-tanei-ink-muted leading-relaxed break-words mt-1">
                    {currentBuildStep.description}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => goToBuildStep(currentBuildStepNumber)}
                  className="mt-1.5 text-[11px] font-bold text-white bg-tanei-brand px-2.5 py-1 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
                >
                  このSTEPから進めましょう →
                </button>
              </div>
            );
          })()}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {steps.map((step) => {
              const isNavStepDone = isBuildStepDone(step.stepNumber);
              const isNavStepCurrent = !isNavStepDone && step.stepNumber === currentBuildStepNumber;
              return (
                <button
                  key={step.stepNumber}
                  type="button"
                  onClick={() => goToBuildStep(step.stepNumber)}
                  aria-label={`STEP ${step.stepNumber}${isNavStepDone ? '（完了）' : isNavStepCurrent ? '（現在の作業）' : ''}`}
                  className={`w-7 h-7 flex-shrink-0 rounded-full border text-xs font-black flex items-center justify-center transition-colors ${
                    isNavStepCurrent
                      ? 'bg-white border-tanei-accent ring-2 ring-tanei-accent/60 text-tanei-accent'
                      : isNavStepDone
                        ? 'bg-tanei-brand border-tanei-brand text-white'
                        : 'bg-tanei-surface border-tanei-border text-tanei-ink-muted hover:border-tanei-brand'
                  }`}
                >
                  {isNavStepDone ? '✓' : step.stepNumber}
                </button>
              );
            })}
          </div>
          {/* 「STEPの進捗」一覧（Phase 3-40）。既存のミニSTEPナビ（丸型9個、Phase 3-34）は
              置き換えず維持したまま、STEP番号＋タイトル＋状態が分かるコンパクトな一覧を追加する。
              状態判定はisBuildStepDone・currentBuildStepNumberのみを使い、新しいSTEP判定・
              新しい保存データは一切作らない */}
          <div className="mt-2.5 pt-2.5 border-t border-tanei-border">
            <p className="text-[11px] font-bold text-tanei-ink-muted mb-1.5">STEPの進捗</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {steps.map((step) => {
                const isListStepDone = isBuildStepDone(step.stepNumber);
                const isListStepCurrent = !isListStepDone && step.stepNumber === currentBuildStepNumber;
                // このSTEPに確認ポイントが存在するかどうかは、既存のisChecklistRelationStepと
                // 全く同じ条件（showChecklistRelation・checklistRelationStepNumber、Phase 3-26）を
                // ここでも再利用するだけ。新しいSTEP↔チェック項目対応表は作らない（Phase 3-45）
                const isListStepChecklistRelation =
                  showChecklistRelation && step.stepNumber === checklistRelationStepNumber;
                return (
                  <li key={step.stepNumber}>
                    {/* ネストしたボタン（下の「確認ポイントを見る →」）を有効なHTMLとして
                        持てるよう、カード全体はbuttonではなくrole="button"のdivにしている。
                        クリック・キーボード操作の挙動はgoToBuildStepへそのまま委譲するだけ */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => goToBuildStep(step.stepNumber)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToBuildStep(step.stepNumber);
                        }
                      }}
                      className={`w-full flex flex-col gap-0.5 rounded-tanei-control border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                        isListStepCurrent
                          ? 'bg-white border-tanei-accent ring-2 ring-tanei-accent/60 shadow-sm'
                          : isListStepDone
                            ? 'bg-tanei-surface-muted border-tanei-border'
                            : 'bg-white border-tanei-border hover:border-tanei-brand hover:bg-tanei-brand-soft'
                      }`}
                    >
                      {/* Phase 3-49：現在STEPだけに付く短い視覚ラベル。既存の「▶ 現在」
                          （状態表示）・「ここから進めましょう」（補助文）とは役割を分け、
                          一覧の中で今どのカードが現在STEPかを一目で見つけられるようにする
                          だけで、判定はisListStepCurrent（＝currentBuildStepNumber）を
                          そのまま使い、新しい判定ロジックは追加しない */}
                      {isListStepCurrent && (
                        <span className="text-[10px] font-black text-tanei-accent">▶ 今ここ</span>
                      )}
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex-shrink-0 text-[11px] font-black ${
                            isListStepCurrent
                              ? 'text-tanei-accent'
                              : isListStepDone
                                ? 'text-tanei-ink-muted'
                                : 'text-tanei-brand'
                          }`}
                        >
                          STEP {step.stepNumber}
                        </span>
                        <span
                          className={`flex-1 min-w-0 text-[11px] font-bold truncate ${
                            isListStepDone ? 'text-tanei-ink-muted' : 'text-tanei-ink'
                          }`}
                        >
                          {step.title}
                        </span>
                        <span
                          className={`flex-shrink-0 text-[10px] font-bold ${
                            isListStepCurrent
                              ? 'text-tanei-accent'
                              : isListStepDone
                                ? 'text-tanei-brand'
                                : 'text-tanei-ink-muted'
                          }`}
                        >
                          {isListStepDone ? '✓ 完了' : isListStepCurrent ? '▶ 現在' : '○ 未完了'}
                        </span>
                      </span>
                      {/* Phase 3-43：状態に応じた短い補助文。既存のisListStepDone・
                          isListStepCurrentと同じ判定結果をそのまま使うだけで、新しい判定
                          ロジックは追加しない。現在STEPだけ強調し、完了・未完了はどちらも
                          控えめな表示にとどめる */}
                      <span
                        className={`text-[10px] ${isListStepCurrent ? 'font-bold text-tanei-accent' : 'text-tanei-ink-muted'}`}
                      >
                        {isListStepDone ? '完了しています' : isListStepCurrent ? 'ここから進めましょう' : 'これから進めます'}
                      </span>
                      {/* Phase 3-50：現在STEPだけに付く次アクションの案内。「▶ 今ここ」
                          （Phase 3-49）・「ここから進めましょう」（Phase 3-43）と情報が
                          重複しすぎないよう、クリック不要な視覚的な案内文だけにとどめる。
                          カード自体が既にgoToBuildStepでクリック可能なため、ここではボタンを
                          追加せず、新しいクリック処理・判定ロジックも作らない。優先度の低い
                          表示として、他の現在STEP表示より控えめな色にする */}
                      {isListStepCurrent && (
                        <span className="text-[10px] text-tanei-ink-muted">→ このSTEPを進める</span>
                      )}
                      {/* Phase 3-45：確認ポイントの状態・導線。既存のrelatedChecklistDoneCount・
                          relatedChecklistTotalから毎回算出するだけで、buildChecklistへの
                          書き込みは一切行わない。STEPカード本体のクリックと独立させるため、
                          ボタン側でstopPropagationしてgoToBuildStepが誤発火しないようにする */}
                      {isListStepChecklistRelation && (
                        <span className="mt-1 pt-1 border-t border-tanei-border flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[10px] text-tanei-ink-muted">
                            確認ポイント{'　'}
                            {relatedChecklistDoneCount === relatedChecklistTotal
                              ? '✓ 確認済み'
                              : relatedChecklistDoneCount === 0
                                ? '○ 未確認'
                                : '◐ 一部確認済み'}
                          </span>
                          {relatedChecklistDoneCount < relatedChecklistTotal && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                scrollToSection(BUILD_CHECKLIST_ANCHOR_ID);
                              }}
                              className="text-[10px] font-bold text-tanei-accent hover:text-tanei-accent-dark"
                            >
                              確認ポイントを見る →
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <ol className="flex flex-col gap-2">
          {steps.map((step) => {
            const isExpanded = expandedStepNumber === step.stepNumber;
            const isDone = isBuildStepDone(step.stepNumber);
            const isCurrent = !isDone && step.stepNumber === currentBuildStepNumber;
            const panelId = `cad-build-step-panel-${step.stepNumber}`;
            const partGroups = findStepPartGroups(model.panels, step.description);
            const isChecklistRelationStep = showChecklistRelation && step.stepNumber === checklistRelationStepNumber;
            return (
              <li
                key={step.stepNumber}
                id={`cad-build-step-${step.stepNumber}`}
                className={`rounded-tanei-control border overflow-hidden transition-colors scroll-mt-4 ${
                  isCurrent
                    ? 'bg-white border-tanei-accent ring-2 ring-tanei-accent/60 shadow-sm'
                    : isDone
                      ? 'bg-tanei-surface-muted border-tanei-border'
                      : 'bg-white border-tanei-border'
                }`}
              >
                {/* 「現在の作業」（Phase 3-24）はSTEPカードの最上部・最も目立つ位置に置き、
                    判定ロジック・文言はCadBuildChecklistView.tsxと統一したまま変更しない（Phase 3-27） */}
                {isCurrent && (
                  <p className="text-[10px] font-black text-tanei-accent px-3 pt-2">▶ 現在の作業</p>
                )}
                <div className="w-full flex items-center gap-2.5 px-3 py-2.5">
                  {/* STEPの完了チェックボックス。開閉トグルのbuttonとは別の独立した要素にし、
                      クリックしても開閉トグルが誤発火しないようstopPropagationする */}
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => handleToggleStepDone(step.stepNumber)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`STEP ${step.stepNumber}「${step.title}」を完了にする`}
                    className="h-5 w-5 flex-shrink-0 accent-tanei-brand cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => toggleStep(step.stepNumber)}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-tanei-brand"
                  >
                    <span
                      className={`flex-shrink-0 text-white text-xs font-black w-7 h-7 rounded-full flex items-center justify-center ${
                        isDone ? 'bg-tanei-ink-muted' : 'bg-tanei-brand'
                      }`}
                    >
                      {step.stepNumber}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-tanei-accent">STEP {step.stepNumber}</span>
                        {isDone && <span className="text-[10px] font-bold text-tanei-ink-muted">✓ 完了</span>}
                      </span>
                      <span
                        className={`block font-bold text-sm break-words ${isDone ? 'text-tanei-ink-muted line-through' : 'text-tanei-ink'}`}
                      >
                        {step.title}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-xs text-tanei-ink-muted" aria-hidden="true">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>
                </div>
                {isExpanded && (
                  <div id={panelId} className="pl-10 pr-3 pb-3">
                    {/* 「状態」と「次にすること」を1つにまとめたブロック。以前は「STEP状態」
                        「STEP概要」「このSTEPのゴール」の3か所に分かれ、同じ完了/現在/未完了の
                        情報や「次のSTEPへ」導線が重複して表示されていたため統合した。
                        判定ロジック自体（isDone・isCurrent・goToBuildStep）は変更していない */}
                    <div className="mb-2.5 pb-2.5 border-b border-tanei-border">
                      {isDone ? (
                        <>
                          <p className="text-xs font-bold text-tanei-ink-muted">✓ 完了</p>
                          {step.stepNumber < steps.length ? (
                            <button
                              type="button"
                              onClick={() => goToBuildStep(step.stepNumber + 1)}
                              className="mt-1 text-[11px] font-bold text-tanei-brand border border-tanei-brand/40 hover:bg-tanei-brand-soft hover:border-tanei-brand rounded-full px-2.5 py-1 transition-colors"
                            >
                              次は STEP {step.stepNumber + 1} へ →
                            </button>
                          ) : (
                            <p className="text-[11px] font-bold text-tanei-brand mt-1">✓ すべてのSTEPが完了しています</p>
                          )}
                        </>
                      ) : isCurrent ? (
                        <p className="text-xs font-bold text-tanei-accent">▶ 今ここから進めましょう</p>
                      ) : (
                        <p className="text-xs font-bold text-tanei-ink">○ 未完了（このSTEPを終えたら次へ進みましょう）</p>
                      )}
                    </div>
                    {/* 作業内容。buildFurnitureSteps()が実際のパーツ位置・寸法・板厚から
                        組み立てた具体的な説明文をそのまま表示する（組み立て位置・下穴の
                        深さ・ビスの長さなど）。AI要約・書き換えは行わない */}
                    <p className="text-xs text-tanei-ink leading-relaxed break-words">{step.description}</p>
                    {partGroups.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-tanei-border">
                        <p className="text-[11px] font-bold text-tanei-ink-muted mb-1.5">使用するパーツ</p>
                        <ul className="flex flex-col gap-1.5">
                          {partGroups.map((group) => (
                            <li
                              key={group.key}
                              className="flex items-center justify-between gap-2 bg-tanei-surface rounded-tanei-control px-2.5 py-2"
                            >
                              <span className="text-xs text-tanei-ink min-w-0">
                                <span className="font-bold">
                                  {group.name}
                                  {group.count > 1 && (
                                    <span className="text-tanei-ink-muted font-normal"> × {group.count}</span>
                                  )}
                                </span>
                                <span className="block text-tanei-ink-muted mt-0.5">
                                  幅 <span className="font-bold text-tanei-ink">{group.widthMm}</span> × 奥行{' '}
                                  <span className="font-bold text-tanei-ink">{group.heightMm}</span> × 厚み{' '}
                                  <span className="font-bold text-tanei-ink">{group.thicknessMm}</span> mm
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => onViewPanel(group.representativePanelId)}
                                className="flex-shrink-0 text-[11px] font-bold text-tanei-brand border border-tanei-brand/40 hover:bg-tanei-brand-soft hover:border-tanei-brand rounded-full px-2.5 py-1 transition-colors"
                              >
                                👁 このパーツを見る
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {isChecklistRelationStep && (
                      <div className="mt-2.5 pt-2.5 border-t border-tanei-border">
                        <p className="text-[11px] font-bold text-tanei-ink-muted mb-1.5">このSTEPの確認ポイント</p>
                        {/* 制作チェック項目6〜9それぞれの完了状態（Phase 3-31）。既存の
                            BUILD_CHECKLIST_STEPS・buildChecklistを読み取り専用で使うだけで、
                            特定のチェック項目番号を特定のSTEP番号に対応付けるものではない
                            （Phase 3-26と同じく、この4件は「作り方」セクション全体に対する
                            確認ポイントとして扱う） */}
                        <ul className="flex flex-col gap-1 mb-1.5">
                          {BUILD_STEP_RELATED_CHECKLIST_ITEMS.map((itemNumber) => {
                            const isItemDone = Boolean(buildChecklist[String(itemNumber)]);
                            return (
                              <li key={itemNumber} className="flex items-start gap-1.5 text-[11px]">
                                <span
                                  className={`flex-shrink-0 font-bold ${isItemDone ? 'text-tanei-brand' : 'text-tanei-ink-muted'}`}
                                >
                                  {isItemDone ? '✓ 確認済み' : '○ 未確認'}
                                </span>
                                <span className={isItemDone ? 'text-tanei-ink-muted line-through' : 'text-tanei-ink'}>
                                  {BUILD_CHECKLIST_STEPS[itemNumber - 1]}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        {relatedChecklistDoneCount === relatedChecklistTotal ? (
                          // 完了しているチェック項目がもう無いため、誘導ボタンは表示しない（Phase 3-28）
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-bold text-tanei-brand">✓ 製作チェック済み</span>
                            <span className="text-[11px] text-tanei-brand">✓ この確認ポイントは完了しています</span>
                            {/* Phase 3-39：完了時の締めくくりの補助表示。制作チェック側の状態は
                                一切書き換えず、既存のrelatedChecklistDoneCount等から表示するだけ */}
                            <span className="text-[10px] text-tanei-ink-muted">このSTEPの確認は完了しています</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {relatedChecklistDoneCount === 0 ? (
                              <span className="text-[11px] font-bold text-tanei-ink-muted">製作チェック：未完了</span>
                            ) : (
                              <span className="text-[11px] font-bold text-tanei-ink-muted">
                                製作チェック：一部完了（{relatedChecklistDoneCount}/{relatedChecklistTotal}）
                              </span>
                            )}
                            {/* Phase 3-32：未完了の確認ポイントがあることを補助的に伝える文言。
                                現在の作業STEPでは少し目立たせ、それ以外は控えめな表示にとどめる */}
                            <p className={isCurrent ? 'text-[11px] font-bold text-tanei-accent' : 'text-[10px] text-tanei-ink-muted'}>
                              まだ確認が必要です
                            </p>
                            {/* Phase 3-39：制作チェック画面への導線を分かりやすくする補助文。
                                実際のチェック更新はCadBuildChecklistView側にのみ任せ、
                                ここでbuildChecklist・cutListCheckedを一切書き換えない */}
                            <p className={isCurrent ? 'text-[11px] font-bold text-tanei-accent' : 'text-[10px] text-tanei-ink-muted'}>
                              確認したら製作チェックを更新してください
                            </p>
                            {/* Phase 3-51：現在STEP（isCurrent）だけ、既存のtanei-accent系トークン
                                （ring-2・text-tanei-accent等で既に使っている強調色）に切り替えて
                                ボタンを少しだけ目立たせる。非現在STEPは従来どおりtanei-brand系の
                                まま変更しない。新しい色・新しいコンポーネントは追加しない */}
                            <button
                              type="button"
                              onClick={() => scrollToSection(BUILD_CHECKLIST_ANCHOR_ID)}
                              className={
                                isCurrent
                                  ? 'self-start flex-shrink-0 text-[11px] font-bold text-tanei-accent border border-tanei-accent/40 hover:bg-tanei-accent/10 hover:border-tanei-accent rounded-full px-2.5 py-1 transition-colors'
                                  : 'self-start flex-shrink-0 text-[11px] font-bold text-tanei-brand border border-tanei-brand/40 hover:bg-tanei-brand-soft hover:border-tanei-brand rounded-full px-2.5 py-1 transition-colors'
                              }
                            >
                              製作チェックを見る →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {/* STEP間の前後ナビゲーション（Phase 3-29）。新しいSTEPデータは作らず、
                        既存のstepNumberとgoToBuildStep（scrollToSectionの再利用）だけで移動する。
                        buildChecklist・cutListCheckedへの書き込みは一切発生しない */}
                    <div className="mt-2.5 pt-2.5 border-t border-tanei-border flex items-center justify-between gap-2">
                      {step.stepNumber > 1 ? (
                        <button
                          type="button"
                          onClick={() => goToBuildStep(step.stepNumber - 1)}
                          className="text-[11px] font-bold text-tanei-brand hover:text-tanei-brand-dark"
                        >
                          ← STEP {step.stepNumber - 1}
                        </button>
                      ) : (
                        <span />
                      )}
                      <span className="text-[11px] text-tanei-ink-muted">
                        STEP {step.stepNumber} / {steps.length}
                      </span>
                      {step.stepNumber < steps.length ? (
                        <button
                          type="button"
                          onClick={() => goToBuildStep(step.stepNumber + 1)}
                          className="text-[11px] font-bold text-tanei-brand hover:text-tanei-brand-dark"
                        >
                          STEP {step.stepNumber + 1} →
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* 「9STEP完了」（指示⑪）。全STEP完了時だけ表示する、はっきりした完了バナー。
            既存の各所の「✓ すべてのSTEPが完了しています」という控えめな表示は変更せず、
            ここに1箇所、最終地点として分かりやすい見た目のものを追加するだけにとどめる */}
        {completedStepCount === steps.length && (
          <div className="rounded-tanei-control border-2 border-tanei-brand bg-tanei-brand-soft px-4 py-4 text-center mt-3">
            <p className="text-base font-black text-tanei-brand">🎉 製作完了！</p>
            <p className="text-xs text-tanei-ink mt-1">✓ すべてのSTEPが完了しています。</p>
          </div>
        )}
          </>
        )}
      </div>

      <div>
        <h3 id={SAFETY_NOTES_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">安全ポイント</h3>
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
