'use client';

// ブラウザCADの最上位コンポーネント。「家具のサイズ」変更に加え、棚板の追加・削除・
// 編集、背板・脚のON/OFFができる（Phase 2-2）。3Dオブジェクトそのものを状態の中心に
// せず、常にFurnitureDesign（状態）→ FurnitureModel.panels（buildFurnitureModelで
// 毎回再計算） → 3D表示、というデータ駆動の流れを維持している。

import { useCallback, useEffect, useMemo, useState } from 'react';
import CadViewport from './CadViewport';
import CadControls from './CadControls';
import CadPartsPanel from './CadPartsPanel';
import CadAppearancePanel from './CadAppearancePanel';
import CadSelectedPartPanel from './CadSelectedPartPanel';
import CadCutlistView from './CadCutlistView';
import CadCutMaterialsView from './CadCutMaterialsView';
import CadBuildChecklistView from './CadBuildChecklistView';
import {
  addShelfToDesign,
  buildFurnitureModel,
  createDefaultFurnitureDesign,
  createDefaultTableDesign,
  FURNITURE_MATERIALS,
  removeShelfFromDesign,
  resizeFurnitureDesign,
  setBackPanel,
  setDoors,
  setLegs,
  updateShelfInDesign,
  type PartMaterialLabel,
} from '../../lib/cad/model';
import type { FurnitureDesign, PanelFinish } from '../../lib/cad/types';
import {
  createNewFurnitureProjectId,
  DEFAULT_FURNITURE_PROJECT_NAME,
  loadFurnitureProject,
  saveFurnitureProject,
  type SavedFurnitureProject,
} from '../../lib/cad/projectStore';

interface CadStudioProps {
  initialDesign?: FurnitureDesign;
  // AI提案（tanei-studio-spec）からの遷移時のみ、CadPageShell.tsxが渡す初期値（Phase 5-02）。
  // initialDesignと同じく、useStateの初期値として一度だけ使われる。通常の/app/cadでは
  // undefinedのため、既存のデフォルト値（DEFAULT_FURNITURE_PROJECT_NAME・FURNITURE_MATERIALS[0]）
  // がそのまま使われ、挙動は変わらない
  initialProjectName?: string;
  initialMaterial?: string;
  // AI提案のpartMaterials（「天板だけパイン集成材、脚・幕板はSPF材」等）を、initialMaterialと
  // 同じ仕組みでuseStateの初期値として一度だけ使う（Phase「パーツごとの材料」）
  initialPartMaterials?: Partial<Record<PartMaterialLabel, string>>;
  // AI提案のpanelFinishes（「天板だけウォルナット調」等）を、initialPartMaterialsと同じ
  // 仕組みでuseStateの初期値として一度だけ使う（Phase B「色・仕上げ」）
  initialPartFinishes?: Partial<Record<PartMaterialLabel, PanelFinish>>;
}

type CadViewMode = 'design' | 'cutlist' | 'cutMaterials' | 'buildCheck';

export default function CadStudio({
  initialDesign,
  initialProjectName,
  initialMaterial,
  initialPartMaterials,
  initialPartFinishes,
}: CadStudioProps) {
  const [design, setDesign] = useState<FurnitureDesign>(initialDesign ?? createDefaultFurnitureDesign());
  // AI相談（チャット）からの提案を反映して来た場合のみtrue。initialDesignと同じく
  // マウント時の値を最初の1回だけ使う（design.kindはその後ユーザー操作で変わらないため、
  // ここが変わっても再判定する必要はない）。チャットから来た場合はAIが家具の種類
  // （箱型／テーブル）を既に決めているため、種類の切り替えボタンは現在の種類だけを
  // 表示し、もう一方の種類への切り替え（＝既定寸法へのリセット、AI提案の消失）を
  // 誤って選べないようにする
  const [cameFromChat] = useState(Boolean(initialDesign));
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [material, setMaterial] = useState<string>(initialMaterial ?? FURNITURE_MATERIALS[0]);
  // パーツ単位の材料上書き（「天板だけパイン集成材、脚・幕板はSPF材」等）。キーが無い
  // パーツは今まで通りmaterial（家具全体の材料）を使う。既定は空オブジェクト＝全パーツ
  // materialのまま、という既存の挙動と完全に一致する
  const [partMaterials, setPartMaterials] = useState<Partial<Record<PartMaterialLabel, string>>>(
    initialPartMaterials ?? {}
  );
  // パーツ単位の色・仕上げ上書き（「天板だけウォルナット調」等）。キーが無いパーツは
  // クリア塗装（材料そのものの色）のまま扱う。partMaterialsと全く同じ考え方・同じ形
  const [partFinishes, setPartFinishes] = useState<Partial<Record<PartMaterialLabel, PanelFinish>>>(
    initialPartFinishes ?? {}
  );
  const [viewMode, setViewMode] = useState<CadViewMode>('design');
  // 制作チェック画面の「制作へ進む」から木取り図画面（cutlist）へ戻ったときだけ、
  // 「制作する」セクションまで自動スクロールするためのフラグ（Phase 2-9）。
  // viewModeの種類は増やさず、既存のcutlist画面内の見せ方だけを変える
  const [scrollToBuildGuide, setScrollToBuildGuide] = useState(false);
  // 制作チェックの各項目にある「確認する」導線（Phase 3-10）から、cutlist画面内の
  // 特定セクションへスクロールするための、Phase 2-9とは別の一時的なターゲットid。
  // Phase 2-9のscrollToBuildGuideは変更せず、並行する専用の状態として持つ
  const [pendingCutlistAnchor, setPendingCutlistAnchor] = useState<string | null>(null);

  // 保存済みプロジェクトの管理状態。projectIdがnull＝まだ一度も保存していない新規設計
  // （「保存する」を押すと新規プロジェクトになる）、値がある＝既存プロジェクトの更新になる
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(initialProjectName ?? DEFAULT_FURNITURE_PROJECT_NAME);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  // カットリスト（Phase 2-7）のチェック状態。キーはCutListItem.id
  const [cutListChecked, setCutListChecked] = useState<Record<string, boolean>>({});
  // 制作チェック（Phase 2-7）のチェック状態。キーはステップ番号（1〜10）の文字列
  const [buildChecklist, setBuildChecklist] = useState<Record<string, boolean>>({});
  // 「作り方」9STEPそれぞれのチェック状態。キーはSTEP番号（1〜9）の文字列。
  // buildChecklist（制作チェック10項目）とは別の独立したチェック状態
  const [buildGuideChecked, setBuildGuideChecked] = useState<Record<string, boolean>>({});
  // 設計・制作メモ（Phase 3-22）。マイページ（SavedItemsModal.tsx）で編集する読み取り専用の
  // 表示用state。ここでは編集しないが、保存のたびに読み込んだ値をそのまま引き継がないと
  // 「CADで保存する」を押しただけでマイページ側のメモが消えてしまうため、handleSave・
  // persistChecklistsの両方に必ず含める
  const [notes, setNotes] = useState('');

  // マイページ「保存した設計」の「開く」から /app/cad?projectId=... で来た場合、
  // 保存済みのFurnitureDesignを読み込んで復元する（木取り図・パーツ一覧・制作情報は
  // 保存していないため、復元後にPanel[]から毎回作り直す既存の仕組みでそのまま再生成される）
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('projectId');
    if (!id) return;

    let cancelled = false;
    (async () => {
      try {
        const project = await loadFurnitureProject(id);
        if (cancelled) return;
        if (!project) {
          setLoadErrorMessage('この設計データを読み込めませんでした。新しい設計として続けられます。');
          return;
        }
        setDesign(project.design);
        setMaterial(project.material);
        setPartMaterials(project.partMaterials ?? {});
        setPartFinishes(project.partFinishes ?? {});
        setProjectId(project.id);
        setProjectCreatedAt(project.createdAt);
        setProjectName(project.projectName);
        setCutListChecked(project.cutListChecked ?? {});
        setBuildChecklist(project.buildChecklist ?? {});
        setBuildGuideChecked(project.buildGuideChecked ?? {});
        setNotes(project.notes ?? '');
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadErrorMessage('この設計データを読み込めませんでした。新しい設計として続けられます。');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const now = new Date().toISOString();
    const id = projectId ?? createNewFurnitureProjectId();
    const project: SavedFurnitureProject = {
      id,
      version: 1,
      projectName: projectName.trim() || DEFAULT_FURNITURE_PROJECT_NAME,
      createdAt: projectCreatedAt ?? now,
      updatedAt: now,
      design,
      material,
      partMaterials: Object.keys(partMaterials).length > 0 ? partMaterials : undefined,
      partFinishes: Object.keys(partFinishes).length > 0 ? partFinishes : undefined,
      cutListChecked,
      buildChecklist,
      buildGuideChecked,
      notes: notes || undefined,
    };
    try {
      await saveFurnitureProject(project);
      setProjectId(project.id);
      setProjectCreatedAt(project.createdAt);
      setProjectName(project.projectName);
      setSaveMessage('設計を保存しました🌱');
      // URLにprojectIdを反映しておく（history.replaceStateなので画面遷移は発生しない）。
      // これが無いと、保存した直後にブラウザをリロードしただけで「今どのプロジェクトを
      // 開いているか」の情報が失われ、新規の設計として扱われてしまう
      const url = new URL(window.location.href);
      url.searchParams.set('projectId', project.id);
      window.history.replaceState(null, '', url.toString());
    } catch (error) {
      console.error(error);
      setSaveMessage('保存に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }, [
    projectId,
    projectCreatedAt,
    projectName,
    design,
    material,
    partMaterials,
    partFinishes,
    cutListChecked,
    buildChecklist,
    buildGuideChecked,
    notes,
  ]);

  // カットリスト・制作チェックのチェック状態は、既に保存済みのプロジェクト（projectIdがある）
  // であれば、トグルのたびに既存のIndexedDB保存機構（saveFurnitureProject）へ自動保存する。
  // まだ一度も保存していない設計は保存先が無いため、チェック状態はこのセッション内のみ有効
  const persistChecklists = useCallback(
    async (patch: {
      cutListChecked?: Record<string, boolean>;
      buildChecklist?: Record<string, boolean>;
      buildGuideChecked?: Record<string, boolean>;
    }) => {
      if (!projectId) return;
      const now = new Date().toISOString();
      const project: SavedFurnitureProject = {
        id: projectId,
        version: 1,
        projectName: projectName.trim() || DEFAULT_FURNITURE_PROJECT_NAME,
        createdAt: projectCreatedAt ?? now,
        updatedAt: now,
        design,
        material,
        partMaterials: Object.keys(partMaterials).length > 0 ? partMaterials : undefined,
        partFinishes: Object.keys(partFinishes).length > 0 ? partFinishes : undefined,
        cutListChecked: patch.cutListChecked ?? cutListChecked,
        buildChecklist: patch.buildChecklist ?? buildChecklist,
        buildGuideChecked: patch.buildGuideChecked ?? buildGuideChecked,
        notes: notes || undefined,
      };
      try {
        await saveFurnitureProject(project);
        setProjectCreatedAt(project.createdAt);
      } catch (error) {
        console.error(error);
      }
    },
    [
      projectId,
      projectCreatedAt,
      projectName,
      design,
      material,
      partMaterials,
      partFinishes,
      cutListChecked,
      buildChecklist,
      buildGuideChecked,
      notes,
    ]
  );

  const handleToggleCutListItem = useCallback(
    (itemId: string) => {
      const next = { ...cutListChecked, [itemId]: !cutListChecked[itemId] };
      setCutListChecked(next);
      void persistChecklists({ cutListChecked: next });
    },
    [cutListChecked, persistChecklists]
  );

  const handleToggleBuildStep = useCallback(
    (step: number) => {
      const key = String(step);
      const next = { ...buildChecklist, [key]: !buildChecklist[key] };
      setBuildChecklist(next);
      void persistChecklists({ buildChecklist: next });
    },
    [buildChecklist, persistChecklists]
  );

  // 「作り方」9STEPそれぞれのチェック（buildChecklist・10項目とは独立）
  const handleToggleBuildGuideStep = useCallback(
    (step: number) => {
      const key = String(step);
      const next = { ...buildGuideChecked, [key]: !buildGuideChecked[key] };
      setBuildGuideChecked(next);
      void persistChecklists({ buildGuideChecked: next });
    },
    [buildGuideChecked, persistChecklists]
  );

  // 自動スクロール後にフラグを戻すためのコールバック。参照を固定しておくことで、
  // CadCutlistView側のuseEffectが不要に再実行されないようにしている
  const handleScrolledToBuildGuide = useCallback(() => {
    setScrollToBuildGuide(false);
  }, []);

  // 制作チェックの各項目の「確認する」導線（Phase 3-10）。cutMaterials（カットリスト）へは
  // そのまま画面ごと切り替え、cutlist内の特定セクションへはpendingCutlistAnchorを
  // 立ててから切り替える。buildChecklist自体は一切読み書きしない（表示・遷移のみ）
  const handleConfirmChecklistSection = useCallback(
    (target: { viewMode: 'cutlist' | 'cutMaterials'; anchorId?: string }) => {
      if (target.anchorId) {
        setPendingCutlistAnchor(target.anchorId);
      }
      setViewMode(target.viewMode);
    },
    []
  );

  const handleScrolledToPendingAnchor = useCallback(() => {
    setPendingCutlistAnchor(null);
  }, []);

  const { model, errorMessage } = useMemo(() => {
    try {
      return {
        model: buildFurnitureModel(design, { material, partMaterials, partFinishes }),
        errorMessage: null as string | null,
      };
    } catch (error) {
      // 板厚に対して高さが小さすぎる等、生成できない寸法の組み合わせを入力中でも
      // アプリを落とさず、直前まで有効だったモデルは保持しつつエラー文だけ表示する
      const message = error instanceof Error ? error.message : '寸法の組み合わせが正しくありません。';
      return { model: null, errorMessage: message };
    }
  }, [design, material, partMaterials, partFinishes]);

  // 直前に有効だった3Dモデルを保持し、入力途中の一時的な不正値（例: 高さを消して
  // まだ何も入力していない一瞬）でビューアが空白にならないようにする
  const [lastValidModel, setLastValidModel] = useState(() =>
    buildFurnitureModel(design, { material, partMaterials, partFinishes })
  );
  if (model && model !== lastValidModel) {
    // レンダー中に直接更新することで、余分な再レンダーなしに「直前の有効なモデル」を
    // 常に最新化する（Reactが公式に認めているderived state更新パターンの一つ）
    setLastValidModel(model);
  }

  const selectedPanel = useMemo(
    () => lastValidModel.panels.find((p) => p.id === selectedPanelId) ?? null,
    [lastValidModel, selectedPanelId]
  );

  const handleDimensionChange = useCallback(
    (patch: Partial<Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness'>>) => {
      setDesign((prev) => resizeFurnitureDesign(prev, patch));
    },
    []
  );

  const handleAddShelf = useCallback(() => {
    setDesign((prev) => addShelfToDesign(prev));
  }, []);

  const handleToggleBackPanel = useCallback(() => {
    setDesign((prev) => setBackPanel(prev, !prev.backPanel));
  }, []);

  const handleToggleLegs = useCallback(() => {
    setDesign((prev) => setLegs(prev, !prev.legs));
  }, []);

  const handleToggleDoors = useCallback(() => {
    setDesign((prev) => setDoors(prev, !(prev.doors ?? false)));
  }, []);

  // 家具の種類（箱型／テーブル）の切り替え。CadViewport.tsxの「正面から見る／斜めから見る」
  // と同じ、明示的なボタン操作による切り替えという考え方を踏襲する。切り替えると
  // 該当する種類の既定寸法へリセットする（別構造への切り替えのため、現在の寸法・
  // 棚板等を引き継ごうとはしない）。選択中パネルもリセットする
  const handleSwitchKind = useCallback((kind: 'box' | 'table') => {
    setDesign(kind === 'table' ? createDefaultTableDesign() : createDefaultFurnitureDesign());
    setSelectedPanelId(null);
  }, []);

  const handleUpdateShelf = useCallback(
    (patch: { zAtMm?: number; widthMm?: number; depthMm?: number }) => {
      if (!selectedPanelId) return;
      setDesign((prev) => updateShelfInDesign(prev, selectedPanelId, patch));
    },
    [selectedPanelId]
  );

  const handleRemoveShelf = useCallback(() => {
    if (!selectedPanelId) return;
    setDesign((prev) => removeShelfFromDesign(prev, selectedPanelId));
    setSelectedPanelId(null);
  }, [selectedPanelId]);

  const handleSelectPanel = useCallback((panelId: string | null) => {
    setSelectedPanelId(panelId);
  }, []);

  // パーツ単位の材料変更（木取り図画面の「パーツごとに材料を分ける」から呼ばれる）。
  // labelに対応する上書きだけを追加・削除し、他のキー・全体のmaterialには触れない
  const handlePartMaterialChange = useCallback((label: PartMaterialLabel, value: string) => {
    setPartMaterials((prev) => {
      if (!value) {
        return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== label)) as Partial<
          Record<PartMaterialLabel, string>
        >;
      }
      return { ...prev, [label]: value };
    });
  }, []);

  // パーツ単位の色・仕上げ変更（「見た目」パネルから呼ばれる）。handlePartMaterialChangeと
  // 全く同じ考え方：labelに対応する上書きだけを追加・削除し、他のキーには触れない
  const handlePartFinishChange = useCallback((label: PartMaterialLabel, value: PanelFinish | '') => {
    setPartFinishes((prev) => {
      if (!value) {
        return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== label)) as Partial<
          Record<PartMaterialLabel, PanelFinish>
        >;
      }
      return { ...prev, [label]: value };
    });
  }, []);

  // 「作るパーツ」一覧（CadBuildGuide、Phase 3-2）の「このパーツを見る」から呼ばれる。
  // 既存のselectedPanelId・CadViewportのハイライト表示をそのまま再利用するだけで、
  // 新しい3D選択の仕組みは作らない
  const handleViewPanel = useCallback((panelId: string) => {
    setSelectedPanelId(panelId);
    setViewMode('design');
  }, []);

  if (viewMode === 'cutMaterials') {
    return (
      <CadCutMaterialsView
        model={lastValidModel}
        checked={cutListChecked}
        onToggle={handleToggleCutListItem}
        onBack={() => setViewMode('cutlist')}
        onNext={() => setViewMode('buildCheck')}
      />
    );
  }

  if (viewMode === 'buildCheck') {
    return (
      <CadBuildChecklistView
        checked={buildChecklist}
        onToggle={handleToggleBuildStep}
        projectName={projectName.trim() || DEFAULT_FURNITURE_PROJECT_NAME}
        onBack={() => setViewMode('cutMaterials')}
        onNext={() => {
          setScrollToBuildGuide(true);
          setViewMode('cutlist');
        }}
        onConfirmSection={handleConfirmChecklistSection}
        projectId={projectId}
        model={lastValidModel}
        material={material}
      />
    );
  }

  if (viewMode === 'cutlist') {
    return (
      <CadCutlistView
        model={lastValidModel}
        material={material}
        onMaterialChange={setMaterial}
        partMaterials={partMaterials}
        onPartMaterialChange={handlePartMaterialChange}
        onBack={() => setViewMode('design')}
        onOpenCutList={() => setViewMode('cutMaterials')}
        scrollToBuildGuide={scrollToBuildGuide}
        onScrolledToBuildGuide={handleScrolledToBuildGuide}
        onViewPanel={handleViewPanel}
        buildChecklist={buildChecklist}
        buildGuideChecked={buildGuideChecked}
        onToggleBuildGuideStep={handleToggleBuildGuideStep}
        onViewBuildCheck={() => setViewMode('buildCheck')}
        pendingAnchor={pendingCutlistAnchor}
        onScrolledToPendingAnchor={handleScrolledToPendingAnchor}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="px-4 py-2 border-b border-tanei-border bg-white flex-shrink-0 flex flex-col gap-2">
        {loadErrorMessage && (
          <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-tanei-control px-2.5 py-1.5">
            {loadErrorMessage}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-xs font-bold text-tanei-ink-muted flex-shrink-0">設計名</span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={DEFAULT_FURNITURE_PROJECT_NAME}
              aria-label="設計の名前"
              className="min-w-0 flex-1 border border-tanei-border rounded-tanei-control px-2.5 py-1.5 text-sm text-tanei-ink font-bold bg-white focus:outline-none focus:ring-2 focus:ring-tanei-brand"
            />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 bg-tanei-brand hover:bg-tanei-brand-dark text-white text-sm font-bold px-3 py-1.5 rounded-tanei-control shadow-sm transition-colors disabled:opacity-50"
          >
            {isSaving ? '保存中…' : '💾 保存する'}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cutlist')}
            className="flex items-center gap-1.5 bg-tanei-accent hover:bg-tanei-accent-dark text-white text-sm font-bold px-3 py-1.5 rounded-tanei-control shadow-sm transition-colors"
          >
            🪚 木取り図を見る
          </button>
        </div>
        {saveMessage && <p className="text-xs font-bold text-tanei-brand">{saveMessage}</p>}

        {/* 家具の種類の切り替え。押すと該当する種類の既定寸法へリセットするため、
            CadViewport.tsxの視点切り替えボタンと同じ「ピル型ボタン2つ」の見た目にして、
            現在編集中の家具そのものを切り替える操作だと分かるようにしている。
            ただしAI相談からの提案で来た場合は、AIが既に種類を決めているため、
            もう一方の種類へ切り替えるボタン（＝既定寸法へリセットし、AI提案の
            寸法・材料が消えてしまう）は表示せず、現在の種類だけを示す */}
        <div className="flex gap-1.5">
          {(!cameFromChat || design.kind !== 'table') && (
            <button
              type="button"
              onClick={() => handleSwitchKind('box')}
              disabled={cameFromChat}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors disabled:cursor-default ${
                design.kind !== 'table'
                  ? 'bg-tanei-brand text-white border-tanei-brand'
                  : 'bg-white text-tanei-ink-muted border-tanei-border hover:border-tanei-brand'
              }`}
            >
              📦 箱型
            </button>
          )}
          {(!cameFromChat || design.kind === 'table') && (
            <button
              type="button"
              onClick={() => handleSwitchKind('table')}
              disabled={cameFromChat}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors disabled:cursor-default ${
                design.kind === 'table'
                  ? 'bg-tanei-brand text-white border-tanei-brand'
                  : 'bg-white text-tanei-ink-muted border-tanei-border hover:border-tanei-brand'
              }`}
            >
              🪑 テーブル
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
        <CadViewport
          model={lastValidModel}
          className="h-64 w-full flex-shrink-0 sm:h-full sm:flex-1"
          selectedPanelId={selectedPanelId}
          onSelectPanel={handleSelectPanel}
        />
        <div className="w-full min-h-0 border-t border-tanei-border sm:w-80 sm:border-l sm:border-t-0 sm:overflow-y-auto">
          <CadControls design={design} onDimensionChange={handleDimensionChange} errorMessage={errorMessage} />
          <CadPartsPanel
            model={lastValidModel}
            backPanel={design.backPanel}
            legs={design.legs}
            doors={design.doors ?? false}
            kind={design.kind}
            selectedPanelId={selectedPanelId}
            onAddShelf={handleAddShelf}
            onToggleBackPanel={handleToggleBackPanel}
            onToggleLegs={handleToggleLegs}
            onToggleDoors={handleToggleDoors}
            onSelectPanel={handleSelectPanel}
          />
          <CadAppearancePanel
            model={lastValidModel}
            partFinishes={partFinishes}
            onPartFinishChange={handlePartFinishChange}
          />
          <CadSelectedPartPanel
            design={design}
            selectedPanel={selectedPanel}
            material={material}
            onUpdateShelf={handleUpdateShelf}
            onRemoveShelf={handleRemoveShelf}
            onDeselect={() => handleSelectPanel(null)}
          />

          {/* 設計メモ（Phase 3-22）。マイページ（SavedItemsModal.tsx）で編集したメモを
              CAD側でも確認できるようにするための、読み取り専用の小さな表示。
              CAD側に編集機能は追加しない（編集はマイページのみ） */}
          {notes && (
            <div className="p-3 border-t border-tanei-border">
              <p className="text-xs font-bold text-tanei-ink-muted mb-1">📝 設計メモ</p>
              <p className="text-sm text-tanei-ink whitespace-pre-wrap break-words">{notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
