'use client';

// 「制作チェック」画面（Phase 2-7）。カットリストの次に、家具作りの基本的な工程を
// 順番にチェックしていける固定のチェックリストを表示する。AIによる自由生成は行わず、
// あらかじめ決まった10ステップだけを使う。
//
// Phase 3-1: 全項目完了時のみ、既存の「完成作品」保存機能（AIチャット側の
// SavedItemsModal.tsx、マイページの「完成作品」）へ、プロジェクト名をタイトル候補として
// 渡しながら遷移するリンクを追加する。CAD側に新しい保存の仕組みは一切作らない。

import Link from 'next/link';
import { BUILD_CHECKLIST_STEPS, getNextBuildStep } from '../../lib/cad/model';

// 制作画面（CadCutlistView.tsx／CadBuildGuide.tsx）内の各セクションと同じid文字列。
// コンポーネントをまたいだimportで結合を強めるのではなく、既存のfreecad-integration/
// STANDARD_BOARD_SIZESと同様に値だけをここでも安全に再利用する（Phase 3-10）
const MATERIALS_ANCHOR_ID = 'cad-materials';
const PARTS_ANCHOR_ID = 'cad-parts';
const BUILD_STEPS_ANCHOR_ID = 'cad-build-steps';
const CUT_LAYOUT_ANCHOR_ID = 'cad-cut-layout';
const SAFETY_NOTES_ANCHOR_ID = 'cad-safety-notes';

interface ConfirmTarget {
  viewMode: 'cutlist' | 'cutMaterials';
  anchorId?: string;
  label: string;
}

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
}

export default function CadBuildChecklistView({
  checked,
  onToggle,
  onBack,
  onNext,
  projectName,
  onConfirmSection,
}: CadBuildChecklistViewProps) {
  const doneCount = BUILD_CHECKLIST_STEPS.filter((_, i) => checked[String(i + 1)]).length;
  // 既存のbuildChecklistから、その場で「最初の未完了項目」を計算するだけ。
  // 新しい進捗データは作らない（保存もしない）。CadBuildGuide.tsx（Phase 3-5）と
  // 完全に同じ関数を使うことで、進捗表示が食い違わないようにしている
  const nextStep = getNextBuildStep(checked);
  const isAllComplete = nextStep === null;
  const nextStepLabel = nextStep?.label ?? null;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm font-bold text-tanei-ink-muted hover:text-tanei-brand"
        >
          ← カットリストに戻る
        </button>

        <div>
          <p className="text-[11px] font-bold text-tanei-accent">STEP 5 / 6</p>
          <h2 className="text-lg font-black text-tanei-ink">制作チェック</h2>
          <p className="text-xs text-tanei-ink-muted mt-0.5">
            今どこまで進んだかを確認しながら、順番に作業を進めましょう。
          </p>
        </div>

        {isAllComplete ? (
          <div className="rounded-tanei-control border border-tanei-brand bg-tanei-brand-soft px-4 py-3 flex flex-col gap-3">
            <div>
              <p className="text-sm font-black text-tanei-brand">✓ 制作完了</p>
              <p className="text-xs text-tanei-ink mt-1">すべての制作チェックが完了しました。</p>
            </div>
            <Link
              href={`/app?openFinished=1&finishedTitle=${encodeURIComponent(projectName)}`}
              className="self-start bg-tanei-brand text-white text-sm font-bold px-4 py-2.5 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
            >
              🏆 完成作品として保存する
            </Link>
          </div>
        ) : (
          <div className="rounded-tanei-control border border-tanei-accent bg-white px-4 py-3">
            <p className="text-xs font-bold text-tanei-ink-muted">次にやること</p>
            <p className="text-base font-black text-tanei-ink mt-1">▶ {nextStepLabel}</p>
            <p className="text-xs text-tanei-ink-muted mt-1">この作業が終わったらチェックしてください</p>
          </div>
        )}

        <p className="text-sm text-tanei-ink">
          制作進捗：<span className="font-black text-tanei-brand">{doneCount} / {BUILD_CHECKLIST_STEPS.length}</span> 完了
        </p>

        <ol className="flex flex-col gap-2">
          {BUILD_CHECKLIST_STEPS.map((label, i) => {
            const stepNumber = i + 1;
            const isChecked = Boolean(checked[String(stepNumber)]);
            const confirmTarget = CONFIRM_TARGETS[i];
            return (
              <li
                key={stepNumber}
                className={`rounded-tanei-control border overflow-hidden transition-colors ${
                  isChecked ? 'bg-tanei-brand-soft border-tanei-brand' : 'bg-white border-tanei-border'
                }`}
              >
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
    </div>
  );
}
