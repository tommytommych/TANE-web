// FreeCAD Spreadsheetから書き出された部品リスト1行分（品名・幅・奥行・厚み・材質・枚数）
export interface RawPart {
  name: string;
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
  material: string;
  qty: number;
}

// ホームセンターで販売されている定尺サイズの板（幅×奥行）
export interface BoardSize {
  label: string;
  widthMm: number;
  heightMm: number;
}

export interface PlacedPiece {
  cutNumber: number;
  name: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
}

export interface LeftoverRect {
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
}

export interface PackedBoard {
  boardIndex: number;
  boardSize: BoardSize;
  placed: PlacedPiece[];
  leftoverRects: LeftoverRect[];
  yieldRate: number; // 0〜1（歩留まり）
}

// 同一の材質・厚みごとにまとめた木取り結果（board size・使用枚数などはこの単位で決まる）
export interface MaterialGroupResult {
  material: string;
  thicknessMm: number;
  boardSize: BoardSize;
  boards: PackedBoard[];
  totalBoardsNeeded: number;
  averageYieldRate: number;
  unplacedParts: RawPart[]; // どの定尺サイズにも収まらなかった部品（要手配確認）
}

export interface AnalysisResult {
  groups: MaterialGroupResult[];
  totalBoardsAllGroups: number;
  warnings: string[];
}
