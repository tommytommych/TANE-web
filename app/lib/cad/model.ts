// FurnitureModel/FurnitureDesignの作成・更新・既存データ形式（木取り図・3Dビューア）への
// 変換ヘルパー。
//
// 【重要】ここが「3D表示用データ・木取り図用データ・設計図用データがバラバラにならない」
// という方針の要になる。木取り図は新しい計算ロジックを作らず、既存のapp/lib/sheetLayout.ts
// （実績のある2次元ビンパッキング）へそのまま渡せる形に変換するだけにしている。
//
// 【状態管理の方針】ユーザーの操作（寸法変更・棚板の追加/削除/編集・背板や脚の切り替え）は
// 全て「FurnitureDesignを新しいFurnitureDesignへ変換する関数」として実装する
// （resizeFurnitureDesign・addShelfToDesign等）。3Dオブジェクトそのものを直接いじる操作は
// 存在しない。CadStudio.tsxはこれらの関数を呼んでReactのstateを更新するだけで、
// panels（延いては3D表示）は毎回buildFurnitureModel()で再計算される。

import type { SheetLayout, SheetPart } from '../sheetLayout';
import type { FurnitureDesign, FurnitureModel, FurniturePanel, FurniturePanelKind, ShelfEntry } from './types';
import { buildFurniturePanels, clampShelfEntry, defaultShelfSize, panelToCutSizeMm } from './geometry';
import { DEMO_ASSEMBLY_MANUAL } from '../assemblyManual';
import { KOHNAN_WOOD_LIST } from '../constants';

// systemPrompt.ts（tanei-studio-specブロック）・tanei-studio/freecad_scripts/generate_model.pyと
// 語彙を揃えている（AIの提案・FreeCAD版・ブラウザCADのどれでも同じ材質名で扱えるようにするため）
export const FURNITURE_MATERIALS = ['パイン集成材', 'シナベニヤ', 'ラワン合板', 'SPF材', 'OSB合板'] as const;
export type FurnitureMaterial = (typeof FURNITURE_MATERIALS)[number];

const DEFAULT_THICKNESS_MM = 18;

/** 新規のFurnitureModelを、寸法だけ指定して作成する（panelsは自動計算、棚板等は無し）。
 * チャット側のtanei-studio-specブロックから箱型家具の外形だけを反映したい場合などに使う */
export function createFurnitureModel(input: {
  projectId: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  material?: string;
  thickness?: number;
}): FurnitureModel {
  const thickness = input.thickness ?? DEFAULT_THICKNESS_MM;
  const material = input.material ?? FURNITURE_MATERIALS[0];
  const design: FurnitureDesign = {
    width: input.width,
    depth: input.depth,
    height: input.height,
    thickness,
    backPanel: true,
    legs: false,
    shelves: [],
  };

  return {
    kind: 'furniture',
    projectId: input.projectId,
    name: input.name,
    width: input.width,
    depth: input.depth,
    height: input.height,
    material,
    thickness,
    panels: buildFurniturePanels(design),
    options: {},
  };
}

// 寸法入力欄で許容する範囲（tanei-studio/server.pyのMIN/MAX_DIMENSION_MMと揃えている）
export const MIN_DIMENSION_MM = 100;
export const MAX_DIMENSION_MM = 3000;
export const MIN_THICKNESS_MM = 10;
export const MAX_THICKNESS_MM = 40;

/** ブラウザCADの最初の実装対象「シンプルな木製棚」の初期状態。
 * 幅750×奥行300×高さ900mm、板厚18mm、背板あり、脚なし、棚板2枚が既定値 */
export function createDefaultFurnitureDesign(): FurnitureDesign {
  const base: Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness' | 'backPanel'> = {
    width: 750,
    depth: 300,
    height: 900,
    thickness: 18,
    backPanel: true,
  };

  let design: FurnitureDesign = { ...base, legs: false, shelves: [] };
  // 初期状態も「棚板を追加」と同じ関数で組み立てることで、追加ロジックの一貫性を保つ
  design = addShelfToDesign(design);
  design = addShelfToDesign(design);
  return design;
}

/** 全ての棚板を、現在の家具寸法（側板・天板・底板・背板の内側）へ収まるよう再クランプする。
 * 家具全体の寸法変更・背板ON/OFFなど、棚板の許容範囲が変わりうる操作の後に必ず通す */
export function withClampedShelves(design: FurnitureDesign): FurnitureDesign {
  return { ...design, shelves: design.shelves.map((shelf) => clampShelfEntry(design, shelf)) };
}

/** 家具全体の寸法（幅・奥行・高さ・板厚のいずれか）を変更する。
 * 側板・天板・底板・背板・棚板が正しい位置関係を保つよう、既存の棚板を自動的にクランプする */
export function resizeFurnitureDesign(
  design: FurnitureDesign,
  patch: Partial<Pick<FurnitureDesign, 'width' | 'depth' | 'height' | 'thickness'>>
): FurnitureDesign {
  return withClampedShelves({ ...design, ...patch });
}

export function setBackPanel(design: FurnitureDesign, backPanel: boolean): FurnitureDesign {
  return withClampedShelves({ ...design, backPanel });
}

export function setLegs(design: FurnitureDesign, legs: boolean): FurnitureDesign {
  return { ...design, legs };
}

let shelfIdCounter = 0;
function nextShelfId(): string {
  shelfIdCounter += 1;
  return `shelf-${Date.now()}-${shelfIdCounter}`;
}

/** 棚板を1枚追加する。「棚の内部に自動配置する」の実装: 既存の棚板・天板・底板の
 * 位置から最も広い隙間を見つけ、その中央に新しい棚板を置く（棚板がまだ無ければ中央に置く） */
export function addShelfToDesign(design: FurnitureDesign): FurnitureDesign {
  const t = design.thickness;
  const minZ = t;
  const maxZ = Math.max(minZ, design.height - t);
  const sortedZ = [minZ, ...design.shelves.map((s) => s.zAtMm), maxZ].sort((a, b) => a - b);

  let gapStart = minZ;
  let gapSize = maxZ - minZ;
  for (let i = 0; i < sortedZ.length - 1; i++) {
    const size = sortedZ[i + 1] - sortedZ[i];
    if (size > gapSize) {
      gapSize = size;
      gapStart = sortedZ[i];
    }
  }

  const { widthMm, depthMm } = defaultShelfSize(design);
  const newShelf: ShelfEntry = {
    id: nextShelfId(),
    zAtMm: gapStart + gapSize / 2,
    widthMm,
    depthMm,
  };

  return { ...design, shelves: [...design.shelves, newShelf] };
}

export function removeShelfFromDesign(design: FurnitureDesign, shelfId: string): FurnitureDesign {
  return { ...design, shelves: design.shelves.filter((s) => s.id !== shelfId) };
}

/** 選択中の棚板1枚の高さ・幅・奥行きを更新する。側板・天板・底板・背板を突き抜けない
 * 範囲へ自動的にクランプする（自由変形は許可しない、という方針の実装箇所） */
export function updateShelfInDesign(
  design: FurnitureDesign,
  shelfId: string,
  patch: Partial<Pick<ShelfEntry, 'zAtMm' | 'widthMm' | 'depthMm'>>
): FurnitureDesign {
  return {
    ...design,
    shelves: design.shelves.map((shelf) =>
      shelf.id === shelfId ? clampShelfEntry(design, { ...shelf, ...patch }) : shelf
    ),
  };
}

/** FurnitureDesignから実際に表示・木取りに使うFurnitureModelを作る
 * （FurnitureDesign → Panel[] → 3D Renderingという流れの、Panel[]計算の入口） */
export function buildFurnitureModel(
  design: FurnitureDesign,
  overrides?: { projectId?: string; name?: string; material?: string }
): FurnitureModel {
  const material = overrides?.material ?? FURNITURE_MATERIALS[0];

  return {
    kind: 'furniture',
    projectId: overrides?.projectId ?? 'shelf-demo',
    name: overrides?.name ?? 'シンプルな木製棚',
    width: design.width,
    depth: design.depth,
    height: design.height,
    material,
    thickness: design.thickness,
    panels: buildFurniturePanels(design),
    options: { backPanel: design.backPanel, legs: design.legs, shelfCount: design.shelves.length },
  };
}

export interface StandardBoardSize {
  label: string;
  widthMm: number;
  heightMm: number;
}

// ホームセンター（コーナン・カインズ・コメリ等）で共通して手に入る定尺サイズ。
// freecad-integration/src/boardSizes.tsのSTANDARD_BOARD_SIZESと同じ2種類（小さい順）を
// 採用している（値の重複はあるが、あちらはNode.js単体パッケージとして意図的に
// 依存関係を持たないため、ここでも同じ値をそのまま定義する）
export const STANDARD_BOARD_SIZES: StandardBoardSize[] = [
  { label: 'サブロク板 (910×1820mm)', widthMm: 910, heightMm: 1820 },
  { label: 'シハチ板 (1210×2430mm)', widthMm: 1210, heightMm: 2430 },
];

/** 全パネルの中で最大の辺が収まる、最小の定尺サイズを選ぶ（回転して収まる向きも考慮）。
 * どの定尺にも収まらないパネルがあればnullを返す */
function pickBoardSizeForPanels(panels: FurniturePanel[]): StandardBoardSize | null {
  let maxWidthMm = 0;
  let maxHeightMm = 0;
  for (const panel of panels) {
    const { widthMm, heightMm } = panelToCutSizeMm(panel);
    maxWidthMm = Math.max(maxWidthMm, widthMm);
    maxHeightMm = Math.max(maxHeightMm, heightMm);
  }

  const fitting = STANDARD_BOARD_SIZES.filter((board) => {
    const fitsAsIs = maxWidthMm <= board.widthMm && maxHeightMm <= board.heightMm;
    const fitsRotated = maxHeightMm <= board.widthMm && maxWidthMm <= board.heightMm;
    return fitsAsIs || fitsRotated;
  });

  if (fitting.length === 0) return null;
  return fitting.reduce((smallest, board) =>
    board.widthMm * board.heightMm < smallest.widthMm * smallest.heightMm ? board : smallest
  );
}

/** FurnitureModelのpanelsを、既存の木取り図PDF/SVG（app/lib/sheetLayout.ts,
 * app/lib/cutSheetPdf.ts）がそのまま受け取れるSheetLayoutへ変換する。
 * 新しいビンパッキングロジックは実装しない（既存ロジックの再利用）。パネルの中に
 * どの定尺サイズにも収まらないもの（家具の幅・奥行が非常に大きい場合など）があれば、
 * 計算不能を示すnullを返す（呼び出し側で初心者向けのエラー文を出す） */
export function furnitureModelToSheetLayout(model: FurnitureModel): SheetLayout | null {
  if (model.panels.length === 0) return null;

  const boardSize = pickBoardSizeForPanels(model.panels);
  if (!boardSize) return null;

  const parts: SheetPart[] = model.panels.map((panel) => {
    const { widthMm, heightMm } = panelToCutSizeMm(panel);
    return { widthMm, heightMm, qty: 1, label: panel.label };
  });

  return {
    name: `${model.material}（${model.thickness}mm厚）・${boardSize.label}`,
    sheetWidthMm: boardSize.widthMm,
    sheetHeightMm: boardSize.heightMm,
    parts,
  };
}

/** Three.js/React Three Fiber（Phase 2以降）でそのまま描画できる形式。
 * tanei-studio/server.pyのserialize_panels_for_viewer()と同じ形（label/x/y/z/dx/dy/dz/color）
 * にidを加えたもの。同じ役割のパネルが複数枚（棚板2枚など）あるとlabelが重複するため、
 * Reactのkeyにはpanel.idではなくlabelを使わないよう、idを別途持たせている */
export interface ViewerPanel {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  color: string;
}

const MATERIAL_COLOR_HEX: Record<string, string> = {
  パイン集成材: '#E8C9A0',
  シナベニヤ: '#E4D5B7',
  ラワン合板: '#C99A6C',
  SPF材: '#D9C29A',
  OSB合板: '#B8926A',
};
const DEFAULT_COLOR_HEX = '#D9C29A';
const LEG_COLOR_HEX = '#6B5B4A';

const FINISH_COLOR_HEX: Record<string, string> = {
  clear: DEFAULT_COLOR_HEX,
  walnut: '#5C3A21',
  white: '#F5F1E8',
  black: '#2B2B2B',
};

function colorForPanel(panel: FurniturePanel, modelMaterial: string): string {
  if (panel.finish && panel.finish in FINISH_COLOR_HEX) return FINISH_COLOR_HEX[panel.finish];
  if (panel.kind === 'leg') return LEG_COLOR_HEX;
  const material = panel.material ?? modelMaterial;
  return MATERIAL_COLOR_HEX[material] ?? DEFAULT_COLOR_HEX;
}

export function furnitureModelToViewerPanels(model: FurnitureModel): ViewerPanel[] {
  return model.panels.map((panel) => ({
    id: panel.id,
    label: panel.label,
    x: panel.position.x,
    y: panel.position.y,
    z: panel.position.z,
    dx: panel.size.x,
    dy: panel.size.y,
    dz: panel.size.z,
    color: colorForPanel(panel, model.material),
  }));
}

/** 「制作する」画面（Phase 2-4の木取り図から続く制作情報）で使う、初心者向け作業手順。
 * AIによる自由生成は行わず、現在のPanel[]から機械的に判断できる範囲（背板・棚板・脚の
 * 有無）だけを文面に反映する、決まった手順のテンプレートを組み立てる */
export interface FurnitureBuildStep {
  stepNumber: number;
  title: string;
  description: string;
}

export function buildFurnitureSteps(panels: FurniturePanel[]): FurnitureBuildStep[] {
  const hasBackPanel = panels.some((p) => p.kind === 'back');
  const hasLegs = panels.some((p) => p.kind === 'leg');
  const shelfCount = panels.filter((p) => p.kind === 'shelf').length;

  const cutTargets = ['天板・底板・側板', hasBackPanel && '背板', shelfCount > 0 && '棚板']
    .filter((v): v is string => Boolean(v))
    .join('・');

  const assembleTargets = [
    '側板に底板・天板を固定',
    shelfCount > 0 && '棚板を取り付け',
    hasBackPanel && '背板を取り付け',
    hasLegs && '脚を取り付け',
  ]
    .filter((v): v is string => Boolean(v))
    .join('、');

  const positionTargets = ['天板・底板・側板', hasBackPanel && '背板', shelfCount > 0 && `棚板（${shelfCount}枚）`, hasLegs && '脚']
    .filter((v): v is string => Boolean(v))
    .join('・');

  const steps: Omit<FurnitureBuildStep, 'stepNumber'>[] = [
    {
      title: '材料を準備する',
      description: '木取り図で選んだ材料と、必要な枚数がそろっているか確認します。',
    },
    {
      title: '木取り図を確認する',
      description: '木取り図を見ながら、どのパーツをどこから切り出すかを確認します。',
    },
    {
      title: '各パーツを寸法どおりにカットする',
      description: `パーツ一覧の寸法を確認しながら、${cutTargets}をカットします。`,
    },
    {
      title: 'カットしたパーツの寸法を確認する',
      description: '切り出したパーツが木取り図・パーツ一覧の寸法と合っているか、メジャーで確認します。',
    },
    {
      title: '組み立て位置を確認する',
      description: `${positionTargets}の位置を仮に合わせ、向きや配置を確認します。`,
    },
    {
      title: '下穴を開ける',
      description: 'ビスを打つ位置に、割れ防止のための下穴を開けます。',
    },
    {
      title: 'ビスで組み立てる',
      description: `${assembleTargets}ます。`,
    },
    {
      title: 'ガタつきや寸法を確認する',
      description: '全体がガタついていないか、直角や水平が保たれているかを確認します。',
    },
    {
      title: '必要に応じて仕上げを行う',
      description: '角をやすりで整えたり、塗装やオイル仕上げをしたい場合はここで行います。',
    },
  ];

  return steps.map((s, i) => ({ stepNumber: i + 1, ...s }));
}

/** 「制作する」画面で表示する工具リスト。新しい工具データベースは作らず、
 * 既存のAssemblyManual（AIチャット側の組立説明書機能）が持つ工具リストをそのまま再利用する */
export const FURNITURE_BUILD_TOOLS: string[] = DEMO_ASSEMBLY_MANUAL.tools;

/** カットリストで使う、パーツの種類ごとの初心者向け名称。既存のFurniturePanelKindを
 * そのまま使い、新しいパーツ分類は作らない（左右の側板は同じ「側板」としてまとめて表示） */
const CUT_LIST_KIND_NAME: Partial<Record<FurniturePanelKind, string>> = {
  top: '天板',
  bottom: '底板',
  left: '側板',
  right: '側板',
  back: '背板',
  shelf: '棚板',
  leg: '脚',
};

export interface CutListItem {
  /** name・寸法から作る安定したキー。同じ寸法・同じ名称のパーツをまとめる際のグループキーにも、
   * チェック状態を保存する際のキーにも使う */
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  qty: number;
}

/** Panel[]から「カットする材料」一覧を作る。同じ名称・同じ寸法のパーツは1行にまとめ、
 * 枚数（qty）を積み上げる。新しい木取り計算は行わず、既存のPanel[]の寸法をそのまま集計するだけ */
export function buildCutListItems(model: FurnitureModel): CutListItem[] {
  const grouped = new Map<string, CutListItem>();
  let unnamedCount = 0;

  model.panels.forEach((panel) => {
    const dims = [panel.size.x, panel.size.y, panel.size.z].sort((a, b) => a - b);
    const thicknessMm = Math.round(dims[0]);
    const heightMm = Math.round(dims[1]);
    const widthMm = Math.round(dims[2]);

    let name = CUT_LIST_KIND_NAME[panel.kind];
    if (!name) {
      unnamedCount += 1;
      name = panel.label || `パーツ${unnamedCount}`;
    }

    const key = `${name}__${widthMm}x${heightMm}x${thicknessMm}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.qty += 1;
    } else {
      grouped.set(key, { id: key, name, widthMm, heightMm, thicknessMm, qty: 1 });
    }
  });

  return Array.from(grouped.values());
}

/** マイページ（保存した設計一覧）で表示する、1プロジェクト分の制作進捗（Phase 2-8）。
 * cutListChecked・buildChecklistという既存データ（Phase 2-7）から画面表示のたびに
 * 計算するだけで、進捗率そのものを保存はしない */
export interface FurnitureProjectProgress {
  cutListDone: number;
  cutListTotal: number;
  /** falseの場合、現在の寸法ではどの定尺サイズにも収まらずカットリスト自体を作れない
   * （furnitureModelToSheetLayoutがnullを返す状態）。cutListTotalは0のまま */
  cutListAvailable: boolean;
  buildDone: number;
  buildTotal: number;
  isComplete: boolean;
}

// 制作チェックの固定10項目（Phase 2-7）。CadBuildChecklistView.tsx・CadBuildGuide.tsx
// （Phase 3-5）の両方から、ここを唯一の情報源として参照する（別々に配列を持たない）
export const BUILD_CHECKLIST_STEPS = [
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
] as const;

const BUILD_CHECKLIST_TOTAL_STEPS = BUILD_CHECKLIST_STEPS.length;

export interface NextBuildStep {
  stepNumber: number;
  label: string;
}

/** buildChecklistから「最初の未完了項目」を求める（Phase 2-9でCadBuildChecklistView.tsxに
 * 実装したものと全く同じロジック）。全て完了していれば、または旧バージョンデータで
 * buildChecklistが存在しない場合は、それぞれ正しい結果（完了 or 先頭のステップ）を返す */
export function getNextBuildStep(buildChecklist: Record<string, boolean> | undefined): NextBuildStep | null {
  const checked = buildChecklist ?? {};
  const index = BUILD_CHECKLIST_STEPS.findIndex((_, i) => !checked[String(i + 1)]);
  if (index === -1) return null;
  return { stepNumber: index + 1, label: BUILD_CHECKLIST_STEPS[index] };
}

export type BuildProgressStatus = 'not_started' | 'building' | 'completed';

/** マイページの保存済み設計一覧を進捗で絞り込む（Phase 3-17）ための3段階判定。
 * buildChecklistだけを見る純粋関数で、design/materialに依存しない（木取り計算が
 * 失敗するような壊れた保存データでも安全に呼び出せる）。buildChecklistが無い旧データ・
 * 空・未知のキーが混ざっている場合もクラッシュせず「未着手」側に倒れる */
export function getBuildProgressStatus(buildChecklist: Record<string, boolean> | undefined): BuildProgressStatus {
  const doneCount = Object.values(buildChecklist ?? {}).filter(Boolean).length;
  if (doneCount >= BUILD_CHECKLIST_TOTAL_STEPS) return 'completed';
  if (doneCount > 0) return 'building';
  return 'not_started';
}

export function computeFurnitureProjectProgress(
  design: FurnitureDesign,
  material: string,
  cutListChecked: Record<string, boolean> | undefined,
  buildChecklist: Record<string, boolean> | undefined
): FurnitureProjectProgress {
  let cutListTotal = 0;
  let cutListDone = 0;
  let cutListAvailable = false;

  try {
    const model = buildFurnitureModel(design, { material });
    const sheetLayout = furnitureModelToSheetLayout(model);
    if (sheetLayout) {
      cutListAvailable = true;
      const items = buildCutListItems(model);
      cutListTotal = items.length;
      const checked = cutListChecked ?? {};
      // 保存されているキーの中に、寸法変更等で今は存在しないパーツのものが残っていても
      // 数えないよう、現在のカットリスト項目と突き合わせてから数える
      cutListDone = items.filter((item) => checked[item.id]).length;
    }
  } catch {
    // 板厚に対して高さが小さすぎる等、寸法が壊れている保存データ。カットリストは
    // 「利用不可」として扱い、マイページ自体はクラッシュさせない
  }

  const buildDoneRaw = Object.values(buildChecklist ?? {}).filter(Boolean).length;
  const buildDone = Math.min(buildDoneRaw, BUILD_CHECKLIST_TOTAL_STEPS);

  return {
    cutListDone,
    cutListTotal,
    cutListAvailable,
    buildDone,
    buildTotal: BUILD_CHECKLIST_TOTAL_STEPS,
    isComplete: buildDone >= BUILD_CHECKLIST_TOTAL_STEPS,
  };
}

export interface MaterialPriceInfo {
  name: string;
  size: string;
  length: string;
  price: string;
  feature: string;
}

/** ブラウザCADの材料選択肢（FURNITURE_MATERIALS）と、既存のAIチャット側の木材価格目安
 * リスト（app/lib/constants.tsのKOHNAN_WOOD_LIST）を名前の一致だけで紐付ける。
 * 新しい価格データは作らず、一致しない場合は空配列を返す（呼び出し側で「価格情報なし」と
 * 表示し、存在しない価格を推測しない） */
export function findMaterialPriceInfo(materialName: string): MaterialPriceInfo[] {
  return KOHNAN_WOOD_LIST.filter(
    (wood) => wood.name.includes(materialName) || materialName.includes(wood.name)
  );
}

/** KOHNAN_WOOD_LISTの価格表記（「約1,200円〜」「約300〜500円」）を安全にパースする。
 * 数値を1つだけ読み取れた場合は「その金額以上（上限なし）」、2つ読み取れた場合は
 * 「下限〜上限」として扱う。想定外の表記は無理にパースせずnullを返す（推測しない） */
function parseWoodPriceRangeYen(priceText: string): { low: number; high: number | null } | null {
  const numbers = Array.from(priceText.matchAll(/[\d,]+/g))
    .map((m) => Number(m[0].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return { low: numbers[0], high: null };
  return { low: Math.min(...numbers), high: Math.max(...numbers) };
}

export interface MaterialCostBreakdownItem {
  /** KOHNAN_WOOD_LIST側のエントリ名（例:「SPF材（1×4）」）。同じ選択材料に複数の
   * 価格帯が対応する場合（SPF材の1×4/2×4等）、行が複数に分かれる */
  name: string;
  quantity: number;
  unitLow: number;
  unitHigh: number | null;
  subtotalLow: number;
  subtotalHigh: number | null;
}

export interface MaterialCostEstimate {
  items: MaterialCostBreakdownItem[];
  totalLow: number;
  /** nullの場合は「合計〇〇円以上」という上限なしの目安 */
  totalHigh: number | null;
}

/** 木取り図（既存app/lib/sheetLayout.ts）から求まる必要枚数と、既存のKOHNAN_WOOD_LISTの
 * 価格目安だけを掛け合わせて、家具1台分の「材料費の目安」を計算する純粋関数。
 * 新しい価格データ・新しい木取り計算は一切作らない。IndexedDB・AIへは一切アクセスしない。
 * 価格情報が1件も見つからない場合はnullを返す（呼び出し側で「価格情報なし」を表示する）。
 * ビス・ボンド・塗料等の副資材は対象外（価格データが存在しないため計算しない） */
export function calculateMaterialCostEstimate(
  material: string,
  requiredSheetCount: number
): MaterialCostEstimate | null {
  const items: MaterialCostBreakdownItem[] = [];

  findMaterialPriceInfo(material).forEach((wood) => {
    const range = parseWoodPriceRangeYen(wood.price);
    if (!range) return;
    items.push({
      name: wood.name,
      quantity: requiredSheetCount,
      unitLow: range.low,
      unitHigh: range.high,
      subtotalLow: range.low * requiredSheetCount,
      subtotalHigh: range.high !== null ? range.high * requiredSheetCount : null,
    });
  });

  if (items.length === 0) return null;

  // 同じ選択材料に複数の価格帯が対応する場合（SPF材の1×4/2×4等）は、どちらを選ぶかで
  // 金額が変わるため、最も安いケース〜最も高いケースの幅を「目安」として示す
  const totalLow = Math.min(...items.map((i) => i.subtotalLow));
  const anyOpenEnded = items.some((i) => i.subtotalHigh === null);
  const totalHigh = anyOpenEnded ? null : Math.max(...items.map((i) => i.subtotalHigh as number));

  return { items, totalLow, totalHigh };
}
