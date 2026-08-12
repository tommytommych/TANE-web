'use client';

// 「制作チェック」画面（Phase 2-7）。カットリストの次に、家具作りの基本的な工程を
// 順番にチェックしていける固定のチェックリストを表示する。AIによる自由生成は行わず、
// あらかじめ決まった10ステップだけを使う。
//
// Phase 3-1: 全項目完了時のみ、既存の「完成作品」保存機能（AIチャット側の
// SavedItemsModal.tsx、マイページの「完成作品」）へ、プロジェクト名をタイトル候補として
// 渡しながら遷移するリンクを追加する。CAD側に新しい保存の仕組みは一切作らない。

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  BUILD_CHECKLIST_STEPS,
  FURNITURE_BUILD_TOOLS,
  calculateMaterialCostEstimate,
  furnitureModelToSheetLayout,
  getNextBuildStep,
} from '../../lib/cad/model';
import { packSheetLayout } from '../../lib/sheetLayout';
import type { FurnitureModel } from '../../lib/cad/types';

// 制作ナビ（Phase 3-12）のsticky表示先・「制作ナビへ戻る」（Phase 3-24）の
// scrollIntoView先として使うid。CadBuildGuide.tsxのscrollToSectionと同じ、
// document.getElementById().scrollIntoView()だけの既存パターンを踏襲する
const BUILD_NAV_ID = 'cad-build-nav';
// 「↑ 制作ナビへ戻る」を表示し始める、制作チェック画面のスクロール量のしきい値（px）
const BACK_TO_NAV_SCROLL_THRESHOLD = 400;

// 「約1,200円〜」のような下限のみの表記と「約300〜500円」のような範囲表記の両方に対応する。
// CadBuildGuide.tsxの同名関数と全く同じ表記ルール（値だけの再利用、importはしない）
const formatYenRange = (low: number, high: number | null): string =>
  high !== null ? `約${low.toLocaleString()}〜${high.toLocaleString()}円` : `約${low.toLocaleString()}円〜`;

// 制作画面（CadCutlistView.tsx／CadBuildGuide.tsx）内の各セクションと同じid文字列。
// コンポーネントをまたいだimportで結合を強めるのではなく、既存のfreecad-integration/
// STANDARD_BOARD_SIZESと同様に値だけをここでも安全に再利用する（Phase 3-10）
const MATERIALS_ANCHOR_ID = 'cad-materials';
const PARTS_ANCHOR_ID = 'cad-parts';
const BUILD_STEPS_ANCHOR_ID = 'cad-build-steps';
const CUT_LAYOUT_ANCHOR_ID = 'cad-cut-layout';
const SAFETY_NOTES_ANCHOR_ID = 'cad-safety-notes';
// 「🛒 買い物リスト」（Phase 3-4で追加済みのCadBuildGuide.tsx内セクション）への
// スクロール先id（Phase 3-23）
const SHOPPING_LIST_ANCHOR_ID = 'cad-shopping-list';

interface ConfirmTarget {
  viewMode: 'cutlist' | 'cutMaterials';
  anchorId?: string;
  label: string;
}

// 制作ナビ（Phase 3-12）。特定のチェック項目に紐付かない、いつでも使える一覧から
// 必要な情報へ戻れるようにするための導線。遷移先はPhase 3-10のCONFIRM_TARGETSと
// 同じ既存セクション・同じonConfirmSection（handleConfirmChecklistSection）を再利用し、
// 新しい画面遷移の仕組みは作らない
const BUILD_NAV_ITEMS: { target: { viewMode: 'cutlist' | 'cutMaterials'; anchorId?: string }; label: string }[] = [
  { target: { viewMode: 'cutlist', anchorId: MATERIALS_ANCHOR_ID }, label: '必要な材料' },
  { target: { viewMode: 'cutlist', anchorId: CUT_LAYOUT_ANCHOR_ID }, label: '木取り図' },
  { target: { viewMode: 'cutMaterials' }, label: 'カットリスト' },
  { target: { viewMode: 'cutlist', anchorId: SHOPPING_LIST_ANCHOR_ID }, label: '買い物リスト' },
  { target: { viewMode: 'cutlist', anchorId: PARTS_ANCHOR_ID }, label: '作るパーツ' },
  { target: { viewMode: 'cutlist', anchorId: BUILD_STEPS_ANCHOR_ID }, label: '作り方' },
  { target: { viewMode: 'cutlist', anchorId: SAFETY_NOTES_ANCHOR_ID }, label: '安全ポイント' },
];

// 各制作チェック項目（BUILD_CHECKLIST_STEPSと同じ順番）から、確認先として自然な
// 既存セクションへの対応表。存在しない・不適切な確認先がある項目はnullにして
// ボタン自体を出さない（無理なリンクを作らない）
const CONFIRM_TARGETS: (ConfirmTarget | null)[] = [
  { viewMode: 'cutlist', anchorId: MATERIALS_ANCHOR_ID, label: '材料を見る' }, // 1. 材料を用意した
  { viewMode: 'cutlist', anchorId: CUT_LAYOUT_ANCHOR_ID, label: '木取り図を見る' }, // 2. 木取り図を確認した
  { viewMode: 'cutMaterials', label: 'カットリストを見る' }, // 3. 材料に寸法を書いた
  { viewMode: 'cutlist', anchorId: PARTS_ANCHOR_ID, label: 'パーツを見る' }, // 4. パーツをカットした
  { viewMode: 'cutMaterials', label: 'カットリストを見る' }, // 5. カット寸法を確認した
  { viewMode: 'cutlist', anchorId: BUILD_STEPS_ANCHOR_ID, label: '作り方を見る' }, // 6. 組み立て位置を確認した
  { viewMode: 'cutlist', anchorId: BUILD_STEPS_ANCHOR_ID, label: '作り方を見る' }, // 7. 下穴を確認した
  { viewMode: 'cutlist', anchorId: BUILD_STEPS_ANCHOR_ID, label: '作り方を見る' }, // 8. 組み立てた
  { viewMode: 'cutlist', anchorId: BUILD_STEPS_ANCHOR_ID, label: '作り方を見る' }, // 9. ガタつきを確認した
  { viewMode: 'cutlist', anchorId: SAFETY_NOTES_ANCHOR_ID, label: '安全ポイントを見る' }, // 10. 仕上げを行った
];

interface CadBuildChecklistViewProps {
  checked: Record<string, boolean>;
  onToggle: (step: number) => void;
  onBack: () => void;
  onNext: () => void;
  projectName: string;
  /** 各項目の「確認する」導線から呼ばれる（Phase 3-10）。buildChecklistは一切変更せず、
   * 既存の画面（cutlist内の該当セクション、またはcutMaterials画面）へ移動するだけ */
  onConfirmSection: (target: { viewMode: 'cutlist' | 'cutMaterials'; anchorId?: string }) => void;
  /** 保存済みプロジェクトのid（CadStudio.tsxのprojectId）。まだ一度も保存していない
   * 設計の場合はnull。完成作品として保存する際、元の設計へ戻れるようにするための
   * 関連付けに使うだけで、それ以外の用途では一切使わない（Phase 3-14） */
  projectId: string | null;
  /** 「制作前チェック」（Phase 3-24）用。CadCutlistView/CadBuildGuideと全く同じ
   * FurnitureModel・材料名を受け取り、木取り枚数・材料費目安をその場で再計算するだけに使う。
   * Panel[]や木取り計算そのものは一切変更しない */
  model: FurnitureModel;
  material: string;
}

export default function CadBuildChecklistView({
  checked,
  onToggle,
  onBack,
  onNext,
  projectName,
  onConfirmSection,
  projectId,
  model,
  material,
}: CadBuildChecklistViewProps) {
  const doneCount = BUILD_CHECKLIST_STEPS.filter((_, i) => checked[String(i + 1)]).length;

  // 「制作前チェック」（Phase 3-24）。CadCutlistView.tsx／CadBuildGuide.tsxと全く同じ
  // furnitureModelToSheetLayout→packSheetLayoutの手順で、その場で必要枚数を再計算するだけ。
  // 新しい木取り計算・新しい保存は行わない。巨大サイズ等で木取り不能な場合はsheetLayoutが
  // nullになり、必要枚数・材料費は「木取り不可のため表示できません」に切り替わる
  const shoppingSheetLayout = furnitureModelToSheetLayout(model);
  const shoppingSheets = shoppingSheetLayout ? packSheetLayout(shoppingSheetLayout) : [];
  const shoppingSheetCount = shoppingSheets.length;
  const shoppingCostEstimate =
    shoppingSheetLayout && shoppingSheetCount > 0
      ? calculateMaterialCostEstimate(material, shoppingSheetCount)
      : null;
  const canPack = Boolean(shoppingSheetLayout) && shoppingSheetCount > 0;

  // 既存のbuildChecklistから、その場で「最初の未完了項目」を計算するだけ。
  // 新しい進捗データは作らない（保存もしない）。CadBuildGuide.tsx（Phase 3-5）と
  // 完全に同じ関数を使うことで、進捗表示が食い違わないようにしている
  const nextStep = getNextBuildStep(checked);
  const isAllComplete = nextStep === null;
  const nextStepLabel = nextStep?.label ?? null;

  // 「現在の作業」に対応する確認ポイント（Phase 3-13）。新しい対応表は作らず、
  // Phase 3-10のCONFIRM_TARGETS（遷移先の正）と、Phase 3-12のBUILD_NAV_ITEMS
  // （分かりやすい表示名）を突き合わせて1件だけ取り出すだけ。二重管理を避けている
  const currentConfirmTarget = nextStep ? CONFIRM_TARGETS[nextStep.stepNumber - 1] : null;
  const currentNavItem = currentConfirmTarget
    ? BUILD_NAV_ITEMS.find(
        (item) =>
          item.target.viewMode === currentConfirmTarget.viewMode &&
          item.target.anchorId === currentConfirmTarget.anchorId
      ) ?? null
    : null;

  // 「↑ 制作ナビへ戻る」（Phase 3-24）。制作前チェックカード等の追加で画面が長くなった分、
  // 画面を下へスクロールした場合だけ、制作ナビへ戻るための導線を表示する。表示・非表示は
  // このコンポーネント内だけの一時的なUI状態で、IndexedDB等には一切保存しない
  const [showBackToNav, setShowBackToNav] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setShowBackToNav(container.scrollTop > BACK_TO_NAV_SCROLL_THRESHOLD);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBuildNav = () => {
    document.getElementById(BUILD_NAV_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={scrollContainerRef} className="flex h-full w-full flex-col overflow-y-auto">
      <div className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {/* Phase 4-01調査で判明：作り方へ戻るには、この「← カットリストに戻る」→
            カットリスト画面の「← 木取り図に戻る」という2クリックの経路しかなく、
            画面下部の「制作へ進む →」（onNext）が実際には既存のBUILD_GUIDE_ANCHOR_ID
            （CadCutlistView.tsx）へ直接scrollIntoViewする、1クリックで作り方へ戻れる
            処理であることも分かりにくかった。Phase 4-04では、既存のonNext（新しい
            viewMode・新しいstateは一切追加していない、CadStudio.tsxの既存処理を
            そのまま再利用）をこの最上部からも呼べるようにし、「← 作り方に戻る」を
            「← カットリストに戻る」より前（優先度が高い側）に配置する。画面下部の
            「制作へ進む →」・「← カットリストに戻る」・「← 木取り図に戻る」は
            いずれも削除・変更しない */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={onNext}
            className="self-start text-sm font-bold text-tanei-brand hover:text-tanei-brand-dark"
          >
            ← 作り方に戻る
          </button>
          <button
            type="button"
            onClick={onBack}
            className="self-start text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand"
          >
            ← カットリストに戻る
          </button>
        </div>

        <div>
          <p className="text-[11px] font-bold text-tanei-accent">STEP 5 / 6</p>
          <h2 className="text-lg font-black text-tanei-ink">制作チェック</h2>
          <p className="text-xs text-tanei-ink-muted mt-0.5">
            今どこまで進んだかを確認しながら、順番に作業を進めましょう。
          </p>
        </div>

        {/* 制作前チェック（Phase 3-24）。作り始める前に「何を買うか・何枚必要か・
            どんな工具が必要か」を一目で確認できるようにするための表示専用カード。
            design・material・sheetLayout・calculateMaterialCostEstimate・
            FURNITURE_BUILD_TOOLSなど既存データから毎回その場で組み立てるだけで、
            新しい保存・新しいチェック状態は一切持たない */}
        <div className="rounded-tanei-control border border-tanei-border bg-tanei-surface px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-tanei-ink-muted">🔎 制作前チェック</p>
          <p className="text-[11px] text-tanei-ink-muted -mt-1">作り始める前に、ここだけ確認しましょう。</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <p className="text-tanei-ink">
              材料：<span className="font-bold">{material}</span>
            </p>
            <p className="text-tanei-ink">
              必要枚数：
              <span className="font-bold">{canPack ? `${shoppingSheetCount}枚` : '木取り不可のため表示できません'}</span>
            </p>
            <p className="text-tanei-ink sm:col-span-2">
              材料費の目安：
              <span className="font-bold">
                {!canPack
                  ? '木取り不可のため表示できません'
                  : shoppingCostEstimate
                    ? formatYenRange(shoppingCostEstimate.totalLow, shoppingCostEstimate.totalHigh)
                    : '参考価格データなし'}
              </span>
            </p>
          </div>

          <div>
            <p className="text-sm text-tanei-ink">必要な工具：</p>
            <p className="text-xs text-tanei-ink-muted mt-0.5">{FURNITURE_BUILD_TOOLS.join('・')}</p>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => onConfirmSection({ viewMode: 'cutlist', anchorId: SHOPPING_LIST_ANCHOR_ID })}
              className="text-xs font-bold text-white bg-tanei-brand px-3 py-1.5 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
            >
              🛒 買い物リストを見る
            </button>
            <button
              type="button"
              onClick={() => onConfirmSection({ viewMode: 'cutlist', anchorId: CUT_LAYOUT_ANCHOR_ID })}
              className="text-xs font-bold text-tanei-ink bg-white border border-tanei-border px-3 py-1.5 rounded-tanei-control hover:bg-tanei-brand-soft hover:border-tanei-brand transition-colors"
            >
              木取り図を確認する
            </button>
            <button
              type="button"
              onClick={() => onConfirmSection({ viewMode: 'cutMaterials' })}
              className="text-xs font-bold text-tanei-ink bg-white border border-tanei-border px-3 py-1.5 rounded-tanei-control hover:bg-tanei-brand-soft hover:border-tanei-brand transition-colors"
            >
              カットリストを確認する
            </button>
          </div>
        </div>

        {isAllComplete ? (
          <div className="rounded-tanei-control border border-tanei-brand bg-tanei-brand-soft px-4 py-3 flex flex-col gap-3">
            <div>
              <p className="text-sm font-black text-tanei-brand">✓ 制作完了</p>
              <p className="text-xs text-tanei-ink mt-1">すべての制作チェックが完了しました。</p>
            </div>
            <Link
              href={`/app?openFinished=1&finishedTitle=${encodeURIComponent(projectName)}${
                projectId ? `&finishedProjectId=${encodeURIComponent(projectId)}` : ''
              }`}
              className="self-start bg-tanei-brand text-white text-sm font-bold px-4 py-2.5 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
            >
              🏆 完成作品として保存する
            </Link>
          </div>
        ) : (
          <div className="rounded-tanei-control border border-tanei-accent bg-white px-4 py-3">
            <p className="text-xs font-bold text-tanei-ink-muted">現在の作業</p>
            <p className="text-[11px] font-black text-tanei-accent mt-1">STEP {nextStep.stepNumber}</p>
            <p className="text-base font-black text-tanei-ink mt-0.5">{nextStepLabel}</p>
            <p className="text-xs text-tanei-ink-muted mt-1">ここまで終わったら、チェックを入れて次へ進みましょう。</p>

            {currentNavItem && (
              <div className="mt-2.5 pt-2.5 border-t border-tanei-border">
                <p className="text-[11px] font-bold text-tanei-ink-muted">確認ポイント</p>
                <p className="text-sm font-bold text-tanei-ink mt-0.5">→ {currentNavItem.label}</p>
                <button
                  type="button"
                  onClick={() => onConfirmSection(currentNavItem.target)}
                  className="mt-1.5 text-xs font-bold text-white bg-tanei-brand px-3 py-1.5 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
                >
                  {currentNavItem.label}を確認
                </button>
              </div>
            )}
          </div>
        )}

        {/* 制作ナビ（Phase 3-12）。「現在の作業」が主役であることを崩さないよう、
            控えめなボタン行として、その直下に補助的に配置する。
            Phase 3-24：制作前チェックカードの追加で画面が長くなったため、スクロールしても
            見失わないようsticky化。スマホでは折り返さず横スクロール1行にして、
            sticky時の高さが増えすぎないようにする */}
        <div
          id={BUILD_NAV_ID}
          className="sticky top-0 z-10 -mx-4 bg-tanei-bg px-4 py-2 border-b border-tanei-border scroll-mt-4"
        >
          <p className="text-[11px] font-bold text-tanei-ink-muted mb-1.5">制作ナビ</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {BUILD_NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onConfirmSection(item.target)}
                className="flex-shrink-0 text-xs font-bold text-tanei-ink bg-tanei-surface border border-tanei-border rounded-tanei-control px-2.5 py-1.5 hover:bg-tanei-brand-soft hover:border-tanei-brand transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-tanei-ink">
          制作進捗：<span className="font-black text-tanei-brand">{doneCount} / {BUILD_CHECKLIST_STEPS.length}</span> 完了
        </p>

        <ol className="flex flex-col gap-2">
          {BUILD_CHECKLIST_STEPS.map((label, i) => {
            const stepNumber = i + 1;
            const isChecked = Boolean(checked[String(stepNumber)]);
            // 既存のnextStep（getNextBuildStep、Phase 2-9と共通）と同じ判定を使い、
            // 「最初の未完了項目」だけを現在の作業として強調する（新しい判定ロジックは作らない）
            const isCurrent = !isChecked && nextStep !== null && stepNumber === nextStep.stepNumber;
            const confirmTarget = CONFIRM_TARGETS[i];
            return (
              <li
                key={stepNumber}
                className={`rounded-tanei-control border overflow-hidden transition-colors ${
                  isChecked
                    ? 'bg-tanei-brand-soft border-tanei-brand'
                    : isCurrent
                      ? 'bg-white border-tanei-accent ring-1 ring-tanei-accent'
                      : 'bg-white border-tanei-border'
                }`}
              >
                {isCurrent && (
                  <p className="text-[10px] font-black text-tanei-accent px-3 pt-2">▶ 現在の作業</p>
                )}
                <label
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    isChecked ? '' : 'hover:bg-tanei-surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(stepNumber)}
                    className="h-4 w-4 accent-tanei-brand flex-shrink-0"
                  />
                  <span className={`text-sm font-bold ${isChecked ? 'text-tanei-ink line-through' : 'text-tanei-ink'}`}>
                    {stepNumber}. {label}
                  </span>
                </label>
                {confirmTarget && (
                  <div className="px-3 pb-2 pl-10">
                    <button
                      type="button"
                      onClick={() => onConfirmSection({ viewMode: confirmTarget.viewMode, anchorId: confirmTarget.anchorId })}
                      className="text-[11px] font-bold text-tanei-brand hover:text-tanei-brand-dark underline"
                    >
                      {confirmTarget.label}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          onClick={onNext}
          className="bg-tanei-brand text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors"
        >
          制作へ進む →
        </button>
      </div>

      {/* 「↑ 制作ナビへ戻る」（Phase 3-24）。一定量スクロールした場合だけ表示する、
          純粋なUI操作用のボタン。buildChecklist等のデータは一切変更しない */}
      {showBackToNav && (
        <button
          type="button"
          onClick={scrollToBuildNav}
          className="fixed bottom-4 right-4 z-20 bg-tanei-brand text-white text-xs font-bold px-3.5 py-2.5 rounded-full shadow-lg hover:bg-tanei-brand-dark transition-colors"
        >
          ↑ 制作ナビへ戻る
        </button>
      )}
    </div>
  );
}
