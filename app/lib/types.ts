export type SavedItemType = 'design' | 'pdf' | 'cutlist' | 'image' | 'history' | 'favorite' | 'finished';

export interface SavedItem {
  id: string;
  type: SavedItemType;
  title: string;
  content: string; // テキスト内容・メモ（種類によって使い方が変わる）
  fileDataUrl?: string; // 画像・PDF・完成作品写真用のデータURL（base64）
  fileMimeType?: string; // fileDataUrl使用時のMIMEタイプ（例: 'application/pdf', 'image/png'）
  date: string;
}
