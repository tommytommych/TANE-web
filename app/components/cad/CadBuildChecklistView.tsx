'use client';

// 「制作チェック」画面（Phase 2-7）。カットリストの次に、家具作りの基本的な工程を
// 順番にチェックしていける固定のチェックリストを表示する。AIによる自由生成は行わず、
// あらかじめ決まった10ステップだけを使う。
//
// Phase 3-1: 全項目完了時のみ、既存の「完成作品」保存機能（AIチャット側の
// SavedItemsModal.tsx、マイページの「完成作品」）へ、プロジェクト名をタイトル候補として
// 渡しながら遷移するリンクを追加する。CAD側に新しい保存の仕組みは一切作らない。

import Link from 'next/link';

interface CadBuildChecklistViewProps {
  checked: Record<string, boolean>;
  onToggle: (step: number) => void;
  onBack: () => void;
  onNext: () => void;
  projectName: string;
}

const BUILD_CHECKLIST_STEPS = [
  '材料を用意した',
  '木取り図を確認した',
  '材料に寸法を書いた',
  'パーツをカットした',
  'カット寸法を確認した',
  '組み立て位置を確認した',
  '下穴を確認した',
  '組み立てた',
  'ガタつきを確認した',
  '仕上げを行った',
];

export default function CadBuildChecklistView({ checked, onToggle, onBack, onNext, projectName }: CadBuildChecklistViewProps) {
  const doneCount = BUILD_CHECKLIST_STEPS.filter((_, i) => checked[String(i + 1)]).length;
  // 既存のbuildChecklistから、その場で「最初の未完了項目」を計算するだけ。
  // 新しい進捗データは作らない（保存もしない）
  const nextIncompleteIndex = BUILD_CHECKLIST_STEPS.findIndex((_, i) => !checked[String(i + 1)]);
  const isAllComplete = nextIncompleteIndex === -1;
  const nextStepLabel = isAllComplete ? null : BUILD_CHECKLIST_STEPS[nextIncompleteIndex];

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
            return (
              <li key={stepNumber}>
                <label
                  className={`flex items-center gap-3 rounded-tanei-control border px-3 py-2.5 cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-tanei-brand-soft border-tanei-brand'
                      : 'bg-white border-tanei-border hover:bg-tanei-surface'
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
