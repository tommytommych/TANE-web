// 「AI空間DIY」の撮影画面用、クライアント側の画像リサイズ・圧縮ヘルパー。
// スマートフォンのカメラ画像（数MB〜十数MB）をそのままAPIへ送るとリクエストが重くなるため、
// 長辺を一定サイズに縮小し、JPEGへ再エンコードしてから送信する。
// 既存プロジェクトに同等のユーティリティは無かったため新規作成（調査済み）。

const MAX_DIMENSION_PX = 1280;
const JPEG_QUALITY = 0.82;
const RESIZE_TIMEOUT_MS = 20000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('resize-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

const drawToJpegDataUrl = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxDimensionPx: number,
  quality: number
): string => {
  const scale = Math.min(1, maxDimensionPx / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
};

// Fileから直接デコードするため、FileReaderでbase64文字列に変換してから<img>でデコードする
// 方式（フォールバック側）よりメモリ効率が良い。実機検証で判明：フォールバック方式は、
// スマホカメラの高解像度写真（数千万画素）だとImage.onload/onerrorのどちらも発火せず、
// エラーも出ないまま無限に待ち続けてしまう不具合があった（メモリ逼迫によるものと推測される）
const resizeViaImageBitmap = async (file: File, maxDimensionPx: number, quality: number): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  try {
    return drawToJpegDataUrl(bitmap, bitmap.width, bitmap.height, maxDimensionPx, quality);
  } finally {
    bitmap.close();
  }
};

// createImageBitmapが無い古いブラウザ向けのフォールバック
const resizeViaFileReader = (file: File, maxDimensionPx: number, quality: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode-failed'));
      img.onload = () => {
        try {
          resolve(drawToJpegDataUrl(img, img.naturalWidth, img.naturalHeight, maxDimensionPx, quality));
        } catch (e) {
          reject(e instanceof Error ? e : new Error('draw-failed'));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

export const resizeImageFileToDataUrl = (
  file: File,
  maxDimensionPx: number = MAX_DIMENSION_PX,
  quality: number = JPEG_QUALITY
): Promise<string> => {
  const task =
    typeof createImageBitmap === 'function'
      ? resizeViaImageBitmap(file, maxDimensionPx, quality).catch(() => resizeViaFileReader(file, maxDimensionPx, quality))
      : resizeViaFileReader(file, maxDimensionPx, quality);
  // 上記どちらの経路も、実機の特定条件下では成功も失敗もせず無限に待ち続ける可能性があるため、
  // 必ず一定時間で確定させ、「写真を読み込めませんでした」というエラー表示に落とす
  return withTimeout(task, RESIZE_TIMEOUT_MS);
};
