export type SavedItemType = 'design' | 'pdf' | 'cutlist' | 'image' | 'history' | 'favorite' | 'finished' | 'cadProject';

export interface SavedItem {
  id: string;
  type: SavedItemType;
  title: string;
  content: string; // テキスト内容・メモ（種類によって使い方が変わる）
  fileDataUrl?: string; // 画像・PDF・完成作品写真用のデータURL（base64）
  fileMimeType?: string; // fileDataUrl使用時のMIMEタイプ（例: 'application/pdf', 'image/png'）
  date: string;
  /** type='finished'（完成作品）が、ブラウザCADの「完成作品として保存する」（Phase 3-1）
   * 経由で保存された場合のみ持つ、元になったtype='cadProject'アイテムのid（Phase 3-14）。
   * 手動保存された完成作品や、この機能追加より前に保存された完成作品には存在しない */
  relatedProjectId?: string;
}
