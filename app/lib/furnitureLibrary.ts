// 「AI空間DIY」用の家具ライブラリー（β版）。AI空間認識の結果（SpaceAnalysis.spaces）を
// もとに、置けそうな家具の候補を提示するための最小限のカタログデータ。
//
// 既存コードに家具カタログ的なデータは存在しなかった（調査済み）ため新規作成するが、
// 材料・色の語彙は既存のブラウザCAD側（app/lib/cad/model.ts）のものをそのまま再利用する。
// こうしておくことで、ユーザーが選んだ材料・色が、そのまま「この家具を作る」でブラウザCAD・
// StudioSpecへ渡せる（studioSpec.tsのmaterial/panelFinishesと同じ語彙のため変換不要）。
import { FURNITURE_MATERIALS, FURNITURE_FINISHES, type FurnitureMaterial } from './cad/model';
import type { PanelFinish } from './cad/types';

export type FurnitureCategory =
  | 'tv-board'
  | 'bookshelf'
  | 'desk'
  | 'storage'
  | 'wall-shelf'
  | 'shoe-rack'
  | 'nightstand'
  | 'magazine-rack'
  | 'storage-box'
  | 'sideboard';

export const FURNITURE_CATEGORIES: readonly FurnitureCategory[] = [
  'tv-board',
  'bookshelf',
  'desk',
  'storage',
  'wall-shelf',
  'shoe-rack',
  'nightstand',
  'magazine-rack',
  'storage-box',
  'sideboard',
];

// β版で選べる材料・色。既存のFURNITURE_MATERIALS／FURNITURE_FINISHES（ブラウザCADの
// 材料・仕上げ選択肢）をそのまま流用し、新しい語彙は増やさない
export const FURNITURE_LIBRARY_MATERIALS: readonly FurnitureMaterial[] = FURNITURE_MATERIALS;
export const FURNITURE_LIBRARY_COLORS: readonly PanelFinish[] = FURNITURE_FINISHES.map((f) => f.value);

export interface FurnitureLibraryItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  description: string;
  /** β版の初期値。ユーザーが後からサイズ設定UIで変更できる（あくまで出発点） */
  defaultWidth: number;
  defaultHeight: number;
  defaultDepth: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  minDepth: number;
  maxDepth: number;
  materials: readonly FurnitureMaterial[];
  colors: readonly PanelFinish[];
  /** 将来、ブラウザCAD・木取り図側の設計データ（StudioSpec等）に紐づけるためのID。
   * β版では実データがまだ無い家具がほとんどのため、今は未設定（undefined）のままでよい */
  designId?: string;
}

// β版・家具ライブラリー本体（5品目）。寸法・可変幅は指示書のdefault値をもとにした
// β版の初期値であり、後から自由に調整できる（このファイルを直接編集するだけでよい設計）
export const FURNITURE_LIBRARY: FurnitureLibraryItem[] = [
  {
    id: 'tv-board',
    name: 'テレビボード',
    category: 'tv-board',
    description: 'テレビ周辺の空きスペースにおすすめの、低めで横長な収納家具です。',
    defaultWidth: 1400,
    defaultHeight: 450,
    defaultDepth: 350,
    minWidth: 800,
    maxWidth: 2000,
    minHeight: 300,
    maxHeight: 600,
    minDepth: 250,
    maxDepth: 450,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'bookshelf',
    name: '本棚',
    category: 'bookshelf',
    description: '壁際の縦のスペースを活かして本や小物を収納できる、背の高い棚です。',
    defaultWidth: 800,
    defaultHeight: 1800,
    defaultDepth: 300,
    minWidth: 400,
    maxWidth: 1200,
    minHeight: 1200,
    maxHeight: 2100,
    minDepth: 200,
    maxDepth: 400,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'desk',
    name: 'デスク',
    category: 'desk',
    description: '作業や勉強に使える、天板の広さを確保したシンプルな机です。',
    defaultWidth: 1200,
    defaultHeight: 720,
    defaultDepth: 600,
    minWidth: 800,
    maxWidth: 1800,
    minHeight: 600,
    maxHeight: 800,
    minDepth: 400,
    maxDepth: 800,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'storage',
    name: '収納棚',
    category: 'storage',
    description: 'コーナーや隙間に置きやすい、正方形に近いバランスの収納棚です。',
    defaultWidth: 900,
    defaultHeight: 900,
    defaultDepth: 350,
    minWidth: 450,
    maxWidth: 1200,
    minHeight: 600,
    maxHeight: 1800,
    minDepth: 250,
    maxDepth: 450,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'wall-shelf',
    name: '壁面棚',
    category: 'wall-shelf',
    description: '壁に取り付けて使う、圧迫感の少ない浅型の棚です。',
    defaultWidth: 900,
    defaultHeight: 300,
    defaultDepth: 250,
    minWidth: 400,
    maxWidth: 1500,
    minHeight: 150,
    maxHeight: 400,
    minDepth: 150,
    maxDepth: 350,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'shoe-rack',
    name: 'シューズラック',
    category: 'shoe-rack',
    description: '玄関の壁際に置きやすい、低めで横長な靴収納です。',
    defaultWidth: 800,
    defaultHeight: 900,
    defaultDepth: 300,
    minWidth: 400,
    maxWidth: 1500,
    minHeight: 400,
    maxHeight: 1200,
    minDepth: 250,
    maxDepth: 400,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'nightstand',
    name: 'ナイトテーブル',
    category: 'nightstand',
    description: 'ベッド脇に置ける、コンパクトなサイドテーブル兼収納です。',
    defaultWidth: 400,
    defaultHeight: 500,
    defaultDepth: 350,
    minWidth: 250,
    maxWidth: 600,
    minHeight: 350,
    maxHeight: 700,
    minDepth: 250,
    maxDepth: 450,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'magazine-rack',
    name: 'マガジンラック',
    category: 'magazine-rack',
    description: '雑誌や小物をまとめて収納できる、細身のラックです。',
    defaultWidth: 400,
    defaultHeight: 600,
    defaultDepth: 250,
    minWidth: 250,
    maxWidth: 700,
    minHeight: 300,
    maxHeight: 900,
    minDepth: 150,
    maxDepth: 350,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'storage-box',
    name: '収納ボックス',
    category: 'storage-box',
    description: '小物をまとめて収納できる、正方形に近いシンプルな箱です。',
    defaultWidth: 350,
    defaultHeight: 350,
    defaultDepth: 350,
    minWidth: 250,
    maxWidth: 600,
    minHeight: 250,
    maxHeight: 600,
    minDepth: 250,
    maxDepth: 600,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
  {
    id: 'sideboard',
    name: 'サイドボード',
    category: 'sideboard',
    description: 'リビングやダイニングに置ける、テレビボードより背の高い収納家具です。',
    defaultWidth: 1200,
    defaultHeight: 700,
    defaultDepth: 400,
    minWidth: 800,
    maxWidth: 1800,
    minHeight: 500,
    maxHeight: 900,
    minDepth: 300,
    maxDepth: 500,
    materials: FURNITURE_LIBRARY_MATERIALS,
    colors: FURNITURE_LIBRARY_COLORS,
  },
];

export const getFurnitureLibraryItem = (id: string): FurnitureLibraryItem | undefined =>
  FURNITURE_LIBRARY.find((item) => item.id === id);

export const getFurnitureLibraryItemsByCategory = (category: string): FurnitureLibraryItem[] =>
  FURNITURE_LIBRARY.filter((item) => item.category === category);
