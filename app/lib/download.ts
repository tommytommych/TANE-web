// PDFバイト列をファイルとしてダウンロードさせる共通ヘルパー。
// createObjectURLで作ったURLはブラウザが解放しないため、クリック後に必ずrevokeする
export const downloadPdfBytes = (bytes: Uint8Array, filename: string): void => {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
