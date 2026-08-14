// TANE:iブラウザCAD（React Three Fiber予定）の中心データ型。
//
// 【設計方針】3D表示・木取り図・設計図・材料リストの4つが、同じ「パネルの配列」を
// 別々の見方で消費するだけになるよう、単一のデータソースとして設計する
// （tanei-studio/freecad_scripts/generate_model.pyの「パネル辞書」アーキテクチャ——
// FreeCAD/POV-Ray/Three.jsビューア/CSV出力が全て同じpanelsリストを参照する設計——を
// TypeScriptへ移植したもの。あちらは実績があるためパターンごと踏襲している）。
//
// 【将来のジャンル拡張】TANE PROJECTは将来的に木工家具（Furniture）以外の制作ジャンル
// （レザークラフト型紙=LeatherPattern、Cameoカットデザイン=CameoDesign、デジタルデータ=
// DigitalDesign等）も扱う構想がある。今回それらの型を実装する必要はないが、
// CadProjectKindという判別可能なユニオン型の受け皿だけ用意しておく。将来
// `type CadProject = FurnitureModel | LeatherPatternModel | ...` のように
// discriminated unionへ拡張しやすくするための最小限の準備であり、それ以上の
// 実装（Creation型の完全な実装、保存・共有・販売機能等）は今回のスコープ外。

/** 将来のジャンル拡張の受け皿。現時点で実データを持つのは 'furniture' のみ */
export type CadProjectKind = 'furniture' | 'leatherPattern' | 'cameoDesign' | 'digitalDesign';

/** mm単位の3次元ベクトル（位置・サイズ両方に使う） */
export interface Vector3Mm {
  x: number;
  y: number;
  z: number;
}

/** パネル1枚の役割（意味的な種類）。tanei-studioのラベル方式と違い、UIの言語に依存しない
 * 識別子にしている（表示用の日本語ラベルは別途labelフィールドに持たせる）。
 * 一覧にない特殊パーツは 'custom' + label で表現できるようにし、将来の拡張を妨げない */
export type FurniturePanelKind =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'back'
  | 'shelf'
  | 'leg'
  | 'apron'
  | 'door'
  | 'drawer'
  | 'custom';

/** パネルの仕上げ（tanei-studio/app/lib/studioSpec.tsのPanelFinishと同じ語彙で揃えている） */
export type PanelFinish = 'clear' | 'walnut' | 'white' | 'black';

export interface FurniturePanel {
  id: string;
  kind: FurniturePanelKind;
  /** 画面・PDF等に出す日本語ラベル（例: "天板"）。kind='custom'の場合は必須 */
  label: string;
  /** 3D空間上の位置（左手前下を原点とする。tanei-studioのcompute_panels()と同じ座標系） */
  position: Vector3Mm;
  /** 3D空間上のサイズ（幅・奥行・高さ。板厚方向も含む） */
  size: Vector3Mm;
  /** モデル全体のmaterial/thicknessを上書きしたい場合のみ指定 */
  material?: string;
  thickness?: number;
  finish?: PanelFinish;
}

/** 追加パーツ（扉・引き出し・脚など）の有無・個数。tanei-studioのoptionsを参考にした
 * ゆるい構造。Phase 1では型の置き場だけ用意し、具体的なパーツ種類はPhase 2以降で拡充する */
export type FurnitureOptions = Record<string, unknown>;

/**
 * 木工家具のCADプロジェクト。ブラウザCAD（Phase 3以降）・木取り図（既存app/lib/sheetLayout.ts）・
 * 設計図・材料リストの全てが、このモデルのpanelsを唯一の入力として動作する想定。
 */
export interface FurnitureModel {
  kind: 'furniture';
  projectId: string;
  name: string;
  /** 外形寸法（mm）。panelsを自動生成する際の入力にも、最終確認用の表示にも使う */
  width: number;
  depth: number;
  height: number;
  material: string;
  thickness: number;
  panels: FurniturePanel[];
  options: FurnitureOptions;
}

/**
 * 棚板1枚分の「編集可能な状態」。追加時は自動配置（geometry.tsのaddShelfToDesign）、
 * 高さ・幅・奥行きはユーザーが個別に上書きできる（ただし側板・天板等を突き抜けない
 * 範囲にmodel.tsのclampShelfEntryで自動的に収める）。
 */
export interface ShelfEntry {
  id: string;
  /** 棚板の下端の高さ位置（mm、本体の底面基準） */
  zAtMm: number;
  widthMm: number;
  depthMm: number;
}

/**
 * ブラウザCADの「編集状態」の中心データ（Phase 2-2）。ユーザーの操作（寸法変更・
 * 棚板の追加/削除/編集・背板や脚の切り替え）は全てこの構造への更新として表現し、
 * ここから毎回FurnitureModel.panelsを計算し直す（3Dオブジェクトそのものは状態管理の
 * 中心にしない）。FurnitureDesign → Panel[]（buildFurnitureModel経由） → 3D Renderingという
 * データ駆動の流れを維持するための入力型。
 */
export interface FurnitureDesign {
  /** 家具の構造の種類。省略時は既存仕様どおり箱型（'box'）として扱う。
   * テーブル（'table'）追加時、backPanel/legs/shelvesは型互換のため残すが未使用の
   * プレースホルダー値になる（保存データの構造・isValidFurnitureDesignは変更しない） */
  kind?: 'box' | 'table';
  width: number;
  depth: number;
  height: number;
  thickness: number;
  backPanel: boolean;
  /** 脚の有無のみ（個別の脚ごとの編集はPhase 2-3以降の検討課題） */
  legs: boolean;
  shelves: ShelfEntry[];
  /** 扉の有無（Phase C「パーツ追加」）。本体前面いっぱいを覆うシンプルな1枚扉のみ
   * （観音開き等の複数枚・蝶番の向きはPhase C以降の拡張課題）。この機能より前に
   * 保存されたプロジェクトには存在しないため、kindと同じ方針でoptionalにし、
   * 省略時はfalse（扉なし）として扱う（isValidFurnitureDesign・geometry.ts参照） */
  doors?: boolean;
  /** 引き出し前板の枚数（Phase C「パーツ追加」）。本体前面いっぱいの幅で、指定した枚数だけ
   * 縦に均等分割した前板を配置するシンプルな構成のみ（実際の引き出し本体・スライドレール・
   * 縦の列分割はPhase C以降の拡張課題）。0または未指定は「引き出しなし」として扱う。
   * doorsと同じ方針でoptionalにし、この機能より前に保存されたプロジェクトとの互換性を保つ */
  drawerCount?: number;
}

/** 保存データ（IndexedDB）から読み込んだFurnitureDesignの構造検証。ブラウザの保存領域が
 * 壊れている・別バージョンのデータが混ざっている等の場合でもアプリを落とさないために使う */
export const isValidFurnitureDesign = (value: unknown): value is FurnitureDesign => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kind === undefined || v.kind === 'box' || v.kind === 'table') &&
    typeof v.width === 'number' &&
    typeof v.depth === 'number' &&
    typeof v.height === 'number' &&
    typeof v.thickness === 'number' &&
    typeof v.backPanel === 'boolean' &&
    typeof v.legs === 'boolean' &&
    (v.doors === undefined || typeof v.doors === 'boolean') &&
    (v.drawerCount === undefined || (typeof v.drawerCount === 'number' && Number.isFinite(v.drawerCount) && v.drawerCount >= 0)) &&
    Array.isArray(v.shelves) &&
    v.shelves.every((s) => {
      if (typeof s !== 'object' || s === null) return false;
      const shelf = s as Record<string, unknown>;
      return (
        typeof shelf.id === 'string' &&
        typeof shelf.zAtMm === 'number' &&
        typeof shelf.widthMm === 'number' &&
        typeof shelf.depthMm === 'number'
      );
    })
  );
};

export const isFurnitureModel = (value: unknown): value is FurnitureModel => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === 'furniture' &&
    typeof v.projectId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.width === 'number' &&
    typeof v.depth === 'number' &&
    typeof v.height === 'number' &&
    typeof v.material === 'string' &&
    typeof v.thickness === 'number' &&
    Array.isArray(v.panels)
  );
};
