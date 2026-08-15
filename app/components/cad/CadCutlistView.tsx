'use client';

// 「木取り図」画面。CADで設計した家具（FurnitureModel）から、既存の木取り計算
// エンジン（app/lib/sheetLayout.ts）・SVG表示（SheetLayoutSvg.tsx）・PDF生成
// （app/lib/cutSheetPdf.ts）をそのまま再利用して、実際にホームセンターへ持って
// いけるカット依頼書まで作れるようにする。新しい木取り計算ロジックは作らない。
//
// 「CAD」「Panel」「SheetLayout」といった開発者向けの言葉は画面に出さず、
// 「設計」「材料」「木取り図」という言葉だけを使う。

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { packSheetLayout } from '../../lib/sheetLayout';
import SheetLayoutSvgView from '../chat/SheetLayoutSvg';
import { buildUniversalCutSheetPdf } from '../../lib/cutSheetPdf';
import { downloadPdfBytes } from '../../lib/download';
import type { FurnitureModel } from '../../lib/cad/types';
import {
  BUILD_CHECKLIST_STEPS,
  buildCutListItems,
  CUT_LIST_KIND_NAME,
  dimensionalLumberItemsToCutGroups,
  FURNITURE_MATERIALS,
  furnitureModelToDimensionalLumberItems,
  furnitureModelToSheetLayout,
  furnitureModelToSheetLayoutsByMaterial,
  getAllowedMaterialsForPartLabel,
  getNextBuildStep,
  type CutListItem,
  type PartMaterialLabel,
} from '../../lib/cad/model';
import CadBuildGuide from './CadBuildGuide';
import LumberCutDiagramSvgView from './LumberCutDiagramSvg';

// 製作チェック（10項目、以前は別画面のCadBuildChecklistView.tsx、viewMode='buildCheck'
// だったが、木取り図画面のセクションとして統合した）へのスクロール先id。
// CadBuildGuide.tsxの同名定数と値を一致させる必要があるが、既存の他のanchor id定数と
// 同じく、importで結合を強めるのではなく値だけを再利用する（既存方針を踏襲）
const BUILD_CHECKLIST_ANCHOR_ID = 'cad-build-checklist';

// 制作チェック画面の「制作へ進む」から来たときだけ、この要素まで自動スクロールする
// （CadBuildGuide自体は変更せず、外側にidを持つラッパーを用意するだけにしている）
const BUILD_GUIDE_ANCHOR_ID = 'cad-build-guide';
// 制作チェックの「木取り図を確認した」からの確認導線（Phase 3-10）のスクロール先
const CUT_LAYOUT_ANCHOR_ID = 'cad-cut-layout';
// 「パーツを見る」導線（CadBuildGuide.tsx・CadBuildChecklistView.tsxの複数箇所）の
// スクロール先id。以前はCadBuildGuide.tsx内の「作るパーツ」セクション独自の一覧が
// この役割を持っていたが、この画面の「パーツ一覧」と内容が重複していたため、
// 「作るパーツ」は削除しこちらのパーツ一覧をその代わりのスクロール先にする
// （CadBuildGuide.tsx・CadBuildChecklistView.tsxのPARTS_ANCHOR_IDと同じ文字列を使う。
// importで結合を強めるのではなく、既存のfreecad-integration/STANDARD_BOARD_SIZESと
// 同様に値だけを再利用する既存の方針を踏襲する）
const PARTS_LIST_ANCHOR_ID = 'cad-parts';
// 「1ページ縦スクロール型」への変更（制作導線UI指示）：以前は別画面（CadCutMaterialsView.tsx、
// viewMode='cutMaterials'）だった「カットリスト」を、この木取り図画面の続きとして
// 同じページ内に埋め込む。CadBuildChecklistView.tsxの「カットリストを確認する」等の
// 導線からのスクロール先として、他のanchor idと同じ命名・共有方針で定義する
const CUT_MATERIALS_ANCHOR_ID = 'cad-cut-materials';
// 「木取り図を確認しました」チェックの保存先キー。新しいチェック状態を追加するのではなく、
// 既存のbuildChecklist（10項目、Phase 2-7）の2番目「木取り図を確認した」をそのまま流用する
// （旧データとの互換性を保つ「案A」方針）
const CUT_LAYOUT_CONFIRMED_KEY = '2';
// 「カット寸法を確認しました」チェックの保存先キー。同じ方針で、buildChecklistの5番目
// 「カット寸法を確認した」を流用する
const CUT_MATERIALS_CONFIRMED_KEY = '5';
// 「カット申込書を確認しました」チェックの保存先キー。buildChecklistの既存10項目には
// 対応する項目が無いため、新しい文字列キーを追加する（buildChecklistはRecord<string,boolean>
// なので、数字以外のキーを増やしても既存データ・既存の10項目の判定ロジックは壊れない）
const CUT_SHEET_CONFIRMED_KEY = 'cutsheet_confirmed';

interface CadCutlistViewProps {
  model: FurnitureModel;
  material: string;
  onMaterialChange: (material: string) => void;
  /** パーツ単位の材料上書き（「天板だけパイン集成材、脚・幕板はSPF材」等）。
   * キーが無いパーツはmaterialを使う */
  partMaterials: Partial<Record<PartMaterialLabel, string>>;
  onPartMaterialChange: (label: PartMaterialLabel, value: string) => void;
  onBack: () => void;
  /** 「作るパーツ」の「このパーツを見る」から呼ばれる（Phase 3-2） */
  onViewPanel: (panelId: string) => void;
  /** 製作チェック（10項目）のチェック状態。CadBuildGuideの製作進捗表示・この画面末尾の
   * 製作チェックセクション両方に渡すほか、この画面自身の「木取り図/カット寸法/
   * カット申込書を確認しました」チェックの現在値の読み取りにも使う */
  buildChecklist: Record<string, boolean>;
  /** buildChecklistの特定キー（木取り図確認・カット寸法確認・カット申込書確認・
   * 製作チェック10項目）をトグルする。CadStudio.tsxの既存のhandleToggleBuildChecklistKeyと
   * 同じ保存先を、文字列キーで直接指定できるようにしたもの */
  onToggleBuildChecklistKey: (key: string) => void;
  /** カットリスト（Phase 2-7の旧cutMaterials画面）のパーツ単位チェック状態。
   * キーはCutListItem.id */
  cutListChecked: Record<string, boolean>;
  onToggleCutListItem: (itemId: string) => void;
  /** 「作り方」9STEPそれぞれのチェック状態（buildChecklistとは独立）。CadBuildGuideへ
   * そのまま中継するだけで、ここでは読み書きしない */
  buildGuideChecked: Record<string, boolean>;
  onToggleBuildGuideStep: (step: number) => void;
  /** 製作チェック完了後の「💾 完成作品を保存する」リンクに使う（既存の
   * /app?openFinished=...への遷移をそのまま利用。CadStudio.tsxのprojectName/projectIdと
   * 同じ値をCadBuildChecklistView.tsx（削除済み）から引き継いだだけで、新しい保存処理は
   * 一切作らない） */
  projectName: string;
  projectId: string | null;
}

export default function CadCutlistView({
  model,
  material,
  onMaterialChange,
  partMaterials,
  onPartMaterialChange,
  onBack,
  onViewPanel,
  buildChecklist,
  onToggleBuildChecklistKey,
  cutListChecked,
  onToggleCutListItem,
  buildGuideChecked,
  onToggleBuildGuideStep,
  projectName,
  projectId,
}: CadCutlistViewProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // 「✓ カット申込書を作成しました」の表示・下の確認チェックボックスの解放に使う、
  // このセッション内だけの一時的な状態（保存はしない。チェック自体はbuildChecklist側で
  // 保存される）。設計を変更してこの画面を開き直した場合は未生成のまま扱われる
  const [hasGeneratedCutSheet, setHasGeneratedCutSheet] = useState(false);

  // 画面上部の簡易進捗表示（指示⑫）。新しい保存データは作らず、既存のbuildChecklist・
  // buildGuideCheckedから毎回算出するだけ。「設計」はこの画面を開いている時点で常に
  // 完了扱いにする（design→cutlistへ進んだ、という既存のviewMode遷移をそのまま使う）。
  // 「制作準備」はCadBuildGuide.tsxのPREP_CHECKLIST_ITEMSと同じキーを直接参照する
  // （importで結合を強めず、値だけを再利用する既存の方針を踏襲）
  const isPrepDone = Boolean(buildChecklist['1'] && buildChecklist['tools_ready'] && buildChecklist['safety_confirmed']);
  const isBuildGuideDone = Array.from({ length: 9 }, (_, i) => String(i + 1)).every((k) => buildGuideChecked[k]);
  const progressSteps = [
    { label: '設計', done: true },
    { label: '木取り', done: Boolean(buildChecklist[CUT_LAYOUT_CONFIRMED_KEY]) },
    { label: 'カット', done: Boolean(buildChecklist[CUT_MATERIALS_CONFIRMED_KEY]) },
    { label: '準備', done: isPrepDone },
    { label: '製作', done: isBuildGuideDone },
    { label: '完成', done: isBuildGuideDone },
  ];
  const currentProgressIndex = progressSteps.findIndex((s) => !s.done);

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

  // 規格材のカット図（📐、LumberCutDiagramSvgView）。板取り図を作らない規格材でも、
  // どの1本からどのパーツを何本切り出すのかが視覚的に分かるようにする（新しい木取り
  // 計算ロジックは作らず、既存のdimensionalLumberItems＝buildCutListItemsの結果を
  // そのままapp/lib/cutSheetPdf.tsのpackMaterialGroupへ渡せる形に変換するだけ）。
  // CadBuildGuide.tsxの「必要な材料」「買い物リスト」がSPF材等の規格材も表示できるよう、
  // この同じ配列をそのままpropsで渡す（新しい集計ロジックは作らない）
  const lumberCutGroups = useMemo(() => dimensionalLumberItemsToCutGroups(dimensionalLumberItems), [dimensionalLumberItems]);
  const lumberCutGroupsByMaterial = useMemo(
    () => new Map(lumberCutGroups.map((g) => [g.material, g.cutGroup])),
    [lumberCutGroups]
  );

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

  // カットリスト（Phase 2-7、以前は別画面のCadCutMaterialsView.tsxにあったロジックを
  // そのまま移設）。木取り図が作れない設計（どの定尺サイズにも収まらない）では、
  // 架空のカットリストを作らず案内文だけを出す既存の方針をそのまま踏襲する
  const cutListItems = useMemo(
    () => (sheetLayouts.length > 0 || dimensionalLumberItems.length > 0 ? buildCutListItems(model) : []),
    [model, sheetLayouts, dimensionalLumberItems]
  );
  const cutListGroupedByMaterial = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, CutListItem[]>();
    cutListItems.forEach((item) => {
      const list = groups.get(item.material);
      if (list) {
        list.push(item);
      } else {
        groups.set(item.material, [item]);
        order.push(item.material);
      }
    });
    return order.map((groupMaterial) => ({ material: groupMaterial, items: groups.get(groupMaterial) ?? [] }));
  }, [cutListItems]);
  const cutListDoneCount = cutListItems.filter((item) => cutListChecked[item.id]).length;

  // 製作チェック（10項目）の進捗。CadBuildGuide.tsxの製作進捗カードと全く同じ
  // buildChecklist・BUILD_CHECKLIST_STEPS・getNextBuildStepから毎回算出するだけで、
  // 新しい進捗データは作らない
  const buildDoneCount = BUILD_CHECKLIST_STEPS.filter((_, i) => buildChecklist[String(i + 1)]).length;
  const buildPercent = Math.round((buildDoneCount / BUILD_CHECKLIST_STEPS.length) * 100);
  const nextBuildStep = getNextBuildStep(buildChecklist);
  const isBuildChecklistComplete = nextBuildStep === null;

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
      setHasGeneratedCutSheet(true);
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

        {/* 画面上部の簡易進捗表示（指示⑫）。「次へ」ボタンを大量に作らず、今どこまで
            進んだかだけを一目で分かるようにする、表示専用の軽量なバー */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-bold">
          {progressSteps.map((step, i) => (
            <span key={step.label} className="flex items-center gap-1.5">
              <span
                className={
                  step.done
                    ? 'text-tanei-brand'
                    : i === currentProgressIndex
                      ? 'text-tanei-accent'
                      : 'text-tanei-ink-muted'
                }
              >
                {step.label} {step.done ? '✓' : i === currentProgressIndex ? '●' : '○'}
              </span>
              {i < progressSteps.length - 1 && <span className="text-tanei-ink-muted">→</span>}
            </span>
          ))}
        </div>

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

                {/* 規格材のカット図（📐）。板材のようなサブロク板の木取り図は作れないが、
                    「決まった長さの1本の材料から、どのパーツを何本切り出すか」を
                    視覚的に示す（新しい木取り計算ロジックは使わず、既存のCutListItem
                    ＝カットリストと全く同じ寸法・本数をそのまま使う） */}
                <div className="flex flex-col gap-3 mb-2">
                  {dimensionalLumberGroups.map((group) => {
                    const cutGroup = lumberCutGroupsByMaterial.get(group.material);
                    if (!cutGroup) return null;
                    return (
                      <LumberCutDiagramSvgView
                        key={group.material}
                        material={group.material}
                        group={cutGroup}
                        items={group.items}
                      />
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2">
                  {dimensionalLumberGroups.map((group) => (
                    <div
                      key={group.material}
                      className="bg-white rounded-tanei-control border border-tanei-border p-3"
                    >
                      <p className="text-xs font-bold text-tanei-brand mb-1.5">
                        {group.material}（規格材）
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
              <h3 id={PARTS_LIST_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">パーツ一覧</h3>
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

            {/* 「制作導線UI」指示①：木取り図を確認したら、チェックを入れてから
                下（カットリスト）へ進む、という自然なスクロール体験にする。
                保存先はbuildChecklistの既存2番目の項目をそのまま流用する（案A） */}
            <label className="flex items-center gap-2.5 rounded-tanei-control border border-tanei-border bg-white px-3 py-2.5 cursor-pointer hover:bg-tanei-surface transition-colors">
              <input
                type="checkbox"
                checked={Boolean(buildChecklist[CUT_LAYOUT_CONFIRMED_KEY])}
                onChange={() => onToggleBuildChecklistKey(CUT_LAYOUT_CONFIRMED_KEY)}
                className="h-4 w-4 accent-tanei-brand flex-shrink-0"
              />
              <span className="text-sm font-bold text-tanei-ink">木取り図を確認しました</span>
            </label>

            {/* 「制作導線UI」指示②：以前は別画面（cutMaterials）だったカットリストを、
                この木取り図の続きとして同じページ内に表示する。別ページへは移動しない */}
            <div className="border-t border-tanei-border pt-4">
              <h3 id={CUT_MATERIALS_ANCHOR_ID} className="text-sm font-bold text-tanei-ink mb-1 scroll-mt-4">
                ② カットリスト
              </h3>
              <p className="text-xs text-tanei-ink-muted mb-2">この寸法で木材をカットしてください。</p>

              {cutListItems.length === 0 ? (
                <p className="text-xs text-tanei-ink-muted">カットリストを作成するための設計情報が不足しています。</p>
              ) : (
                <>
                  <p className="text-xs text-tanei-ink mb-2">
                    進捗：<span className="font-black text-tanei-brand">{cutListDoneCount} / {cutListItems.length}</span> 完了
                  </p>
                  <div className="flex flex-col gap-3">
                    {cutListGroupedByMaterial.map((group) => (
                      <div key={group.material}>
                        <p className="text-xs font-bold text-tanei-brand mb-1.5">■ {group.material}</p>
                        <ul className="flex flex-col gap-2">
                          {group.items.map((item) => {
                            const isItemChecked = Boolean(cutListChecked[item.id]);
                            return (
                              <li key={item.id}>
                                <label
                                  className={`flex items-start gap-3 rounded-tanei-control border px-3 py-2.5 cursor-pointer transition-colors ${
                                    isItemChecked
                                      ? 'bg-tanei-brand-soft border-tanei-brand'
                                      : 'bg-white border-tanei-border hover:bg-tanei-surface'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isItemChecked}
                                    onChange={() => onToggleCutListItem(item.id)}
                                    className="mt-0.5 h-4 w-4 accent-tanei-brand flex-shrink-0"
                                  />
                                  <span className="flex-1">
                                    <span
                                      className={`block font-bold text-sm ${isItemChecked ? 'text-tanei-ink line-through' : 'text-tanei-ink'}`}
                                    >
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
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <label className="flex items-center gap-2.5 rounded-tanei-control border border-tanei-border bg-white px-3 py-2.5 cursor-pointer hover:bg-tanei-surface transition-colors">
              <input
                type="checkbox"
                checked={Boolean(buildChecklist[CUT_MATERIALS_CONFIRMED_KEY])}
                onChange={() => onToggleBuildChecklistKey(CUT_MATERIALS_CONFIRMED_KEY)}
                className="h-4 w-4 accent-tanei-brand flex-shrink-0"
              />
              <span className="text-sm font-bold text-tanei-ink">カット寸法を確認しました</span>
            </label>

            {/* 「制作導線UI」指示③：カット申込書もこの画面内で完結する操作のまま
                （既存どおりPDFはブラウザのダウンロードのみで別ページへは移動しない）。
                生成後は「✓ 作成しました」の確認表示と確認チェックを続けて表示する */}
            <div className="border-t border-tanei-border pt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="w-full bg-tanei-brand text-white px-4 py-3 rounded-tanei-control text-sm font-bold hover:bg-tanei-brand-dark transition-colors disabled:opacity-50"
              >
                {isGeneratingPdf ? 'カット申込書を作成中…' : '📝 カット申込書を作る'}
              </button>
              {hasGeneratedCutSheet && (
                <>
                  <p className="text-xs font-bold text-tanei-brand">✓ カット申込書を作成しました</p>
                  <label className="flex items-center gap-2.5 rounded-tanei-control border border-tanei-border bg-white px-3 py-2.5 cursor-pointer hover:bg-tanei-surface transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(buildChecklist[CUT_SHEET_CONFIRMED_KEY])}
                      onChange={() => onToggleBuildChecklistKey(CUT_SHEET_CONFIRMED_KEY)}
                      className="h-4 w-4 accent-tanei-brand flex-shrink-0"
                    />
                    <span className="text-sm font-bold text-tanei-ink">カット申込書を確認しました</span>
                  </label>
                </>
              )}
            </div>

            {primaryLayout && (
              <div id={BUILD_GUIDE_ANCHOR_ID}>
                <CadBuildGuide
                  model={model}
                  material={material}
                  sheetLayout={primaryLayout}
                  sheetCount={primarySheetCount}
                  lumberCutGroups={lumberCutGroups}
                  onViewPanel={onViewPanel}
                  buildChecklist={buildChecklist}
                  onToggleBuildChecklistKey={onToggleBuildChecklistKey}
                  buildGuideChecked={buildGuideChecked}
                  onToggleBuildGuideStep={onToggleBuildGuideStep}
                />
              </div>
            )}

            {/* 製作チェック（10項目）。以前は別画面（CadBuildChecklistView.tsx、
                viewMode='buildCheck'）だったが、上の「制作する」セクション（材料・工具・
                パーツ・作り方・安全ポイント）と内容が重複する「🔎 製作前チェック」カードや
                「製作ナビ」等は再現せず、木取り図画面と全く同じ1本のページの続きとして、
                実際にチェックする10項目と完了時の保存導線だけをここに置く。チェック状態
                （buildChecklist）・判定（getNextBuildStep）は既存のものをそのまま使う */}
            {primaryLayout && (
              <div id={BUILD_CHECKLIST_ANCHOR_ID} className="border-t border-tanei-border pt-4 scroll-mt-4">
                <h3 className="text-sm font-bold text-tanei-ink mb-1">製作チェック</h3>
                <p className="text-xs text-tanei-ink-muted mb-2">
                  実際に製作しながら、完了した項目にチェックを入れてください。
                </p>
                <p className="text-xs text-tanei-ink mb-2">
                  製作チェック：
                  <span className="font-black text-tanei-brand">
                    {buildDoneCount} / {BUILD_CHECKLIST_STEPS.length}
                  </span>{' '}
                  完了（{buildPercent}%）
                </p>
                <ol className="flex flex-col gap-2">
                  {BUILD_CHECKLIST_STEPS.map((label, i) => {
                    const stepNumber = i + 1;
                    const isChecked = Boolean(buildChecklist[String(stepNumber)]);
                    const isCurrent = !isChecked && nextBuildStep !== null && stepNumber === nextBuildStep.stepNumber;
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
                        {isCurrent && <p className="text-[10px] font-black text-tanei-accent px-3 pt-2">▶ 現在の作業</p>}
                        <label
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                            isChecked ? '' : 'hover:bg-tanei-surface'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleBuildChecklistKey(String(stepNumber))}
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

                {isBuildChecklistComplete ? (
                  <div className="mt-3 rounded-tanei-control border border-tanei-brand bg-tanei-brand-soft px-4 py-4 flex flex-col gap-3">
                    <div>
                      <p className="text-sm font-black text-tanei-brand">✓ 製作完了</p>
                      <p className="text-xs text-tanei-ink mt-1">すべての製作チェックが完了しました。</p>
                    </div>
                    <Link
                      href={`/app?openFinished=1&finishedTitle=${encodeURIComponent(projectName)}${
                        projectId ? `&finishedProjectId=${encodeURIComponent(projectId)}` : ''
                      }`}
                      className="self-start bg-tanei-brand text-white text-sm font-bold px-4 py-2.5 rounded-tanei-control hover:bg-tanei-brand-dark transition-colors"
                    >
                      💾 完成作品を保存する
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-tanei-ink-muted mt-2">
                    あと{BUILD_CHECKLIST_STEPS.length - buildDoneCount}項目チェックすると製作完了です。
                  </p>
                )}
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
