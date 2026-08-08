import type { PackedBoard } from './types';

// 1枚の板の木取り図をSVGとして書き出す（依存ライブラリなし、単純な文字列テンプレート）。
// Phase2で予定している「画像またはSVG/PDFの返却」に向けた最小の土台
export function boardToSvg(board: PackedBoard): string {
  const { widthMm, heightMm } = board.boardSize;
  const palette = ['#f8d5d5', '#d4e8fa', '#dcf5d8', '#fce8c8', '#e8d8f7', '#fbf8c8'];

  const pieceRects = board.placed
    .map((p, i) => {
      const color = palette[i % palette.length];
      const labelSize = Math.min(28, p.widthMm / 6, p.heightMm / 4);
      return `
    <rect x="${p.x}" y="${p.y}" width="${p.widthMm}" height="${p.heightMm}" fill="${color}" stroke="#333" stroke-width="2" />
    <text x="${p.x + p.widthMm / 2}" y="${p.y + p.heightMm / 2}" font-size="${labelSize}" text-anchor="middle" dominant-baseline="middle" fill="#222">${p.name} #${p.cutNumber}</text>`;
    })
    .join('\n');

  const leftoverRects = board.leftoverRects
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.widthMm}" height="${r.heightMm}" fill="#eeeeee" stroke="#999" stroke-width="1" stroke-dasharray="6,6" />`
    )
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm} ${heightMm}" width="${widthMm}" height="${heightMm}">
  <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="#ffffff" stroke="#000" stroke-width="4" />
  ${leftoverRects}
  ${pieceRects}
</svg>`;
}
