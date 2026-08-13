import { PDFDocument, PageSizes, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import type { MaterialGroup } from './cutlist';
import { packSheetLayout, type SheetLayout, type PackedSheet } from './sheetLayout';

// 木取り図（カット図）のデモデータ。チャットに該当データが見つからない場合のフォールバック
export const DEMO_MATERIAL_GROUPS: MaterialGroup[] = [
  {
    name: '1x6 (1820mm)',
    boardLengthMm: 1820,
    parts: [
      { sizeMm: 625, qty: 2 },
      { sizeMm: 300, qty: 3 },
      { sizeMm: 260, qty: 4 },
    ],
  },
  {
    name: '1x2 (1820mm)',
    boardLengthMm: 1820,
    parts: [
      { sizeMm: 450, qty: 3 },
      { sizeMm: 200, qty: 4 },
    ],
  },
  {
    name: 'シナベニヤ (910mm)',
    boardLengthMm: 910,
    parts: [
      { sizeMm: 400, qty: 2 },
      { sizeMm: 150, qty: 3 },
    ],
  },
];

const CUT_KERF_MM = 3; // のこ刃の厚み分。ピースを1つ置くたびに実際に消費される幅として加算する

interface PackedBoard {
  pieces: number[];
  usedMm: number;
  leftoverMm: number;
}

// 1次元ビンパッキング（First Fit Decreasing）で、パーツを元板へ自動的に詰めていく
const packMaterialGroup = (group: MaterialGroup): PackedBoard[] => {
  const pieces: number[] = [];
  group.parts.forEach((part) => {
    for (let i = 0; i < part.qty; i++) pieces.push(part.sizeMm);
  });
  pieces.sort((a, b) => b - a);

  const boards: PackedBoard[] = [];
  pieces.forEach((size) => {
    const board = boards.find((b) => {
      const needed = b.pieces.length === 0 ? size : size + CUT_KERF_MM;
      return b.usedMm + needed <= group.boardLengthMm;
    });
    if (board) {
      const needed = board.pieces.length === 0 ? size : size + CUT_KERF_MM;
      board.pieces.push(size);
      board.usedMm += needed;
    } else {
      boards.push({ pieces: [size], usedMm: size, leftoverMm: 0 });
    }
  });

  boards.forEach((b) => {
    b.leftoverMm = Math.max(0, group.boardLengthMm - b.usedMm);
  });
  return boards;
};

// パーツのサイズごとに視認性の良いパステルカラーを割り当てる
const PASTEL_PALETTE: readonly (readonly [number, number, number])[] = [
  [0.98, 0.85, 0.85],
  [0.83, 0.91, 0.98],
  [0.87, 0.96, 0.85],
  [0.99, 0.92, 0.78],
  [0.92, 0.85, 0.97],
  [0.98, 0.97, 0.78],
  [0.8, 0.95, 0.94],
  [0.98, 0.87, 0.94],
];

const createSizeColorMap = (groups: MaterialGroup[]): Map<number, readonly [number, number, number]> => {
  const sizes = Array.from(new Set(groups.flatMap((g) => g.parts.map((p) => p.sizeMm)))).sort((a, b) => b - a);
  const map = new Map<number, readonly [number, number, number]>();
  sizes.forEach((size, i) => map.set(size, PASTEL_PALETTE[i % PASTEL_PALETTE.length]));
  return map;
};

// シート材（幅×高さ）のパーツサイズごとに視認性の良いパステルカラーを割り当てる
const createSheetSizeColorMap = (
  sheets: PackedSheet[][]
): Map<string, readonly [number, number, number]> => {
  const keys = Array.from(
    new Set(sheets.flatMap((sheetGroup) => sheetGroup.flatMap((s) => s.placed.map((p) => `${p.widthMm}x${p.heightMm}`))))
  ).sort();
  const map = new Map<string, readonly [number, number, number]>();
  keys.forEach((key, i) => map.set(key, PASTEL_PALETTE[i % PASTEL_PALETTE.length]));
  return map;
};

// pdf-libのdrawText({ maxWidth })は半角スペースでしか折り返せず、分かち書きしない日本語では
// 1行がそのまま枠外にはみ出してしまうため、文字単位で幅を計測して自前で折り返す
export const wrapTextToWidth = (
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] => {
  const lines: string[] = [];
  let currentLine = '';

  for (const char of Array.from(text)) {
    const candidate = currentLine + char;
    if (currentLine !== '' && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine !== '') lines.push(currentLine);

  return lines;
};

// YouTubeチャンネルへのリンク。フッターのQRコード・表記に使用する
const TOMISHIN_CHANNEL_URL = 'https://www.youtube.com/@tomishin_channel_DIY';

// コーナン・カインズ・コメリなど主要ホームセンターで共通して使える、
// TANE:iオリジナルの汎用カット申込書を1枚にまとめて生成する
export const buildUniversalCutSheetPdf = async (
  materialGroupsInput: MaterialGroup[] = DEMO_MATERIAL_GROUPS,
  sheetLayouts: SheetLayout[] = [],
  // ブラウザCAD（Phase 2-4）から呼ぶ場合のみ指定。家具名・使用材料・必要枚数を
  // ヘッダー直下に1行追加する（省略時は従来どおり何も表示しない＝既存呼び出し元は無変更）
  furnitureInfo?: { name: string; material: string; sheetCount: number }
): Promise<Uint8Array> => {
  // 引数なし（デモ表示）の時だけデモデータを使い、シート材のみが渡された場合は
  // 1次元木取り図セクション自体を表示しない
  const materialGroups =
    materialGroupsInput.length === 0 && sheetLayouts.length === 0 ? DEMO_MATERIAL_GROUPS : materialGroupsInput;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  let page = pdfDoc.addPage(PageSizes.A4);
  let { width, height } = page.getSize();

  // 標準14フォント（Helvetica等）は日本語グリフを持たないため、
  // 日本語対応の埋め込みフォント（M PLUS 1p / SIL Open Font License）を使用する
  const [regularFontBytes, boldFontBytes] = await Promise.all([
    fetch('/fonts/MPLUS1p-Regular.ttf').then((res) => res.arrayBuffer()),
    fetch('/fonts/MPLUS1p-Bold.ttf').then((res) => res.arrayBuffer()),
  ]);
  const fontRegular = await pdfDoc.embedFont(regularFontBytes);
  const fontBold = await pdfDoc.embedFont(boldFontBytes);

  // フッターに表示するとみしんチャンネルDIY（YouTube）へのQRコードを生成して埋め込む
  const youtubeQrDataUrl = await QRCode.toDataURL(TOMISHIN_CHANNEL_URL, {
    margin: 1,
    width: 200,
    color: { dark: '#3A2F27', light: '#FFFFFF' },
  });
  const youtubeQrPngBytes = Uint8Array.from(atob(youtubeQrDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const youtubeQrImage = await pdfDoc.embedPng(youtubeQrPngBytes);

  const margin = 40;
  const tableWidth = width - margin * 2;

  const brand = rgb(0.086, 0.639, 0.29); // TANE:iカット申込書のブランドカラー（#16A34A・鮮やかなグリーン）
  const brandTint = rgb(0.906, 0.965, 0.925);
  const black = rgb(0.12, 0.12, 0.12);
  const gray = rgb(0.45, 0.45, 0.45);
  const border = rgb(0.75, 0.75, 0.75);

  let cursorY = height - margin;

  // ページ下端を超える場合は新しいページへ改ページする
  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight < margin) {
      page = pdfDoc.addPage(PageSizes.A4);
      ({ width, height } = page.getSize());
      cursorY = height - margin;
      page.drawText('TANE:i オリジナル汎用カット申込書（続き）', {
        x: margin,
        y: cursorY,
        size: 12,
        font: fontBold,
        color: brand,
      });
      cursorY -= 22;
    }
  };

  // ---------- ヘッダー ----------
  const headerHeight = 78;
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: brand });
  page.drawText('TANE:i オリジナル汎用カット申込書', {
    x: margin,
    y: height - 36,
    size: 19,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('木材カット依頼シート', {
    x: margin,
    y: height - 58,
    size: 11,
    font: fontRegular,
    color: rgb(1, 1, 1),
  });

  cursorY = height - headerHeight - 16;

  // ---------- 家具情報（家具名・使用材料・必要枚数） ----------
  if (furnitureInfo) {
    page.drawText(
      `家具名: ${furnitureInfo.name}　使用材料: ${furnitureInfo.material}　必要枚数: ${furnitureInfo.sheetCount}枚`,
      { x: margin, y: cursorY, size: 10.5, font: fontBold, color: black }
    );
    cursorY -= 18;
  }

  // ---------- 対応店舗の注記（仕様4） ----------
  const compatNoteHeight = 28;
  page.drawRectangle({
    x: margin,
    y: cursorY - compatNoteHeight,
    width: tableWidth,
    height: compatNoteHeight,
    color: brandTint,
    borderColor: brand,
    borderWidth: 1,
  });
  page.drawText(
    '※コーナン、カインズ、コメリなどの主要ホームセンターのカットサービスで共通してご利用いただけます',
    {
      x: margin + 10,
      y: cursorY - compatNoteHeight + 10,
      size: 9,
      font: fontBold,
      color: brand,
    }
  );
  cursorY -= compatNoteHeight + 18;

  // ---------- ご利用にあたって ----------
  page.drawText('ご利用にあたって', { x: margin, y: cursorY, size: 11, font: fontBold, color: black });
  cursorY -= 16;

  const usageNotes = [
    'サイズは全てミリ（mm）単位で記載しています。',
    'のこ刃の厚み（約3mm）を見込んで木取りしていますが、実際の誤差は店舗の機械により異なります。',
    'カット料金・本数上限・受付ルールは店舗により異なりますので、詳細は各店舗スタッフへご確認ください。',
  ];
  usageNotes.forEach((note) => {
    wrapTextToWidth(`・${note}`, fontRegular, 8.5, tableWidth - 8).forEach((line) => {
      page.drawText(line, { x: margin, y: cursorY, size: 8.5, font: fontRegular, color: gray });
      cursorY -= 12;
    });
  });
  cursorY -= 14;

  // ---------- 木取り図（カット図）（仕様1・2・3） ----------
  if (materialGroups.length > 0) {
  page.drawText('■ 木取り図（カット図）', { x: margin, y: cursorY, size: 13, font: fontBold, color: black });
  cursorY -= 16;

  wrapTextToWidth(
    '元板の種類ごとに、切り出すパーツの配置を自動計算して図にしています。色は同じサイズのパーツごとに割り当てています。',
    fontRegular,
    8.5,
    tableWidth
  ).forEach((line) => {
    page.drawText(line, { x: margin, y: cursorY, size: 8.5, font: fontRegular, color: gray });
    cursorY -= 11;
  });
  cursorY -= 10;

  const sizeColorMap = createSizeColorMap(materialGroups);
  const barHeight = 26;
  const barGap = 8;
  const groupGap = 14;
  const maxBoardLengthMm = Math.max(...materialGroups.map((g) => g.boardLengthMm));
  const diagramScale = (tableWidth - 80) / maxBoardLengthMm;
  // ※元板の長さの比率がそのまま図の横幅に反映されるよう、全グループで共通のスケールを使う

  materialGroups.forEach((group) => {
    const boards = packMaterialGroup(group);
    const summary = group.parts.map((p) => `${p.sizeMm}(${p.qty})`).join('　');

    ensureSpace(16 + (barHeight + barGap) * boards.length + groupGap);

    // ---- グループ見出し（材質・元板サイズ + パーツ内訳） ----
    page.drawText(group.name, { x: margin, y: cursorY, size: 11, font: fontBold, color: black });
    const nameWidth = fontBold.widthOfTextAtSize(group.name, 11);
    page.drawText(summary, {
      x: margin + nameWidth + 12,
      y: cursorY,
      size: 9,
      font: fontRegular,
      color: gray,
    });
    cursorY -= 16;

    boards.forEach((board, boardIdx) => {
      ensureSpace(barHeight + barGap);

      const barWidthPt = group.boardLengthMm * diagramScale;
      const y = cursorY - barHeight;
      let x = margin;

      // 元板の全長を表す背景枠
      page.drawRectangle({
        x: margin,
        y,
        width: barWidthPt,
        height: barHeight,
        color: rgb(1, 1, 1),
        borderColor: border,
        borderWidth: 1,
      });

      board.pieces.forEach((size) => {
        const pieceWidthPt = size * diagramScale;
        const color = sizeColorMap.get(size) ?? ([0.9, 0.9, 0.9] as const);
        page.drawRectangle({
          x,
          y,
          width: pieceWidthPt,
          height: barHeight,
          color: rgb(color[0], color[1], color[2]),
          borderColor: black,
          borderWidth: 1,
        });
        const label = `${size}`;
        const labelWidth = fontBold.widthOfTextAtSize(label, 8);
        if (labelWidth + 6 < pieceWidthPt) {
          page.drawText(label, {
            x: x + pieceWidthPt / 2 - labelWidth / 2,
            y: y + barHeight / 2 - 4,
            size: 8,
            font: fontBold,
            color: black,
          });
        }
        x += pieceWidthPt;
      });

      // 端材（残り）をハッチング付きのグレーボックスで表示（仕様3）
      if (board.leftoverMm > 0.5) {
        const leftoverWidthPt = board.leftoverMm * diagramScale;
        page.drawRectangle({
          x,
          y,
          width: leftoverWidthPt,
          height: barHeight,
          color: rgb(0.88, 0.88, 0.88),
          borderColor: black,
          borderWidth: 1,
        });

        const hatchGap = 6;
        for (let offset = -barHeight; offset < leftoverWidthPt; offset += hatchGap) {
          let sx = x + offset;
          let sy = y;
          let ex = x + offset + barHeight;
          let ey = y + barHeight;
          if (sx < x) {
            sy += x - sx;
            sx = x;
          }
          if (ex > x + leftoverWidthPt) {
            ey -= ex - (x + leftoverWidthPt);
            ex = x + leftoverWidthPt;
          }
          if (ex > sx) {
            page.drawLine({
              start: { x: sx, y: sy },
              end: { x: ex, y: ey },
              thickness: 0.5,
              color: rgb(0.65, 0.65, 0.65),
            });
          }
        }

        const leftoverLabel = `残り${Math.round(board.leftoverMm)}mm`;
        const leftoverLabelSize = 7.5;
        const leftoverLabelWidth = fontRegular.widthOfTextAtSize(leftoverLabel, leftoverLabelSize);
        if (leftoverLabelWidth + 6 < leftoverWidthPt) {
          page.drawRectangle({
            x: x + leftoverWidthPt / 2 - leftoverLabelWidth / 2 - 2,
            y: y + barHeight / 2 - leftoverLabelSize / 2 - 1,
            width: leftoverLabelWidth + 4,
            height: leftoverLabelSize + 2,
            color: rgb(0.88, 0.88, 0.88),
          });
          page.drawText(leftoverLabel, {
            x: x + leftoverWidthPt / 2 - leftoverLabelWidth / 2,
            y: y + barHeight / 2 - 3,
            size: leftoverLabelSize,
            font: fontRegular,
            color: black,
          });
        } else {
          // 端材が細すぎて枠内に収まらない場合は、バーの右側外側の上段に表示する
          // （下段は「N本目」ラベルの表示スペースとして空けておき、重ならないようにする）
          page.drawText(leftoverLabel, {
            x: x + leftoverWidthPt + 4,
            y: y + barHeight - 9,
            size: 7,
            font: fontRegular,
            color: gray,
          });
        }
      }

      if (boards.length > 1) {
        // 「N本目」ラベルはバー右側外側の下段に固定し、端材ラベル（上段）と重ならないようにする
        page.drawText(`${boardIdx + 1}本目`, {
          x: margin + barWidthPt + 4,
          y: y + 2,
          size: 7,
          font: fontRegular,
          color: gray,
        });
      }

      cursorY -= barHeight + barGap;
    });

    cursorY -= groupGap - barGap;
  });
  cursorY -= 4;
  }

  // ---------- 木取り図（シート材・2次元自動配置） ----------
  const packedSheetLayouts = sheetLayouts.map((layout) => packSheetLayout(layout));
  if (sheetLayouts.length > 0) {
    page.drawText('■ 木取り図（合板・シート材の自動配置）', {
      x: margin,
      y: cursorY,
      size: 13,
      font: fontBold,
      color: black,
    });
    cursorY -= 16;

    wrapTextToWidth(
      '板（縦×横）の中にパーツを自動で敷き詰めて配置しています。カット番号と切断寸法、余り材（斜線部分）、歩留まり（使用率）を表示しています。',
      fontRegular,
      8.5,
      tableWidth
    ).forEach((line) => {
      page.drawText(line, { x: margin, y: cursorY, size: 8.5, font: fontRegular, color: gray });
      cursorY -= 11;
    });
    cursorY -= 8;

    const sheetColorMap = createSheetSizeColorMap(packedSheetLayouts);
    const maxDiagramWidthPt = tableWidth * 0.9;
    const maxDiagramHeightPt = 220;

    sheetLayouts.forEach((layout, layoutIdx) => {
      const sheets = packedSheetLayouts[layoutIdx];
      const scale = Math.min(
        maxDiagramWidthPt / layout.sheetWidthMm,
        maxDiagramHeightPt / layout.sheetHeightMm
      );
      const diagramWidthPt = layout.sheetWidthMm * scale;
      const diagramHeightPt = layout.sheetHeightMm * scale;

      sheets.forEach((sheet, sheetIdx) => {
        ensureSpace(diagramHeightPt + 40);

        const headerText =
          sheets.length > 1
            ? `${layout.name}（${sheet.sheetWidthMm}×${sheet.sheetHeightMm}mm）　${sheetIdx + 1}枚目 / 全${sheets.length}枚`
            : `${layout.name}（${sheet.sheetWidthMm}×${sheet.sheetHeightMm}mm）`;
        page.drawText(headerText, { x: margin, y: cursorY, size: 10.5, font: fontBold, color: black });
        const yieldText = `歩留まり ${Math.round(sheet.yieldRate * 100)}%　余り材 約${Math.round(sheet.leftoverAreaMm2 / 1000)}cm²`;
        const yieldTextWidth = fontRegular.widthOfTextAtSize(yieldText, 9);
        page.drawText(yieldText, {
          x: margin + tableWidth - yieldTextWidth,
          y: cursorY,
          size: 9,
          font: fontRegular,
          color: gray,
        });
        cursorY -= 14;

        const originX = margin;
        const originTopY = cursorY;
        const originY = originTopY - diagramHeightPt;

        // 板全体の外枠
        page.drawRectangle({
          x: originX,
          y: originY,
          width: diagramWidthPt,
          height: diagramHeightPt,
          color: rgb(0.95, 0.94, 0.9),
          borderColor: black,
          borderWidth: 1.2,
        });

        // 余り材（未使用エリア）をハッチング付きで表示
        sheet.leftoverRects.forEach((rect) => {
          const rx = originX + rect.x * scale;
          const ry = originTopY - (rect.y + rect.heightMm) * scale;
          const rw = rect.widthMm * scale;
          const rh = rect.heightMm * scale;
          page.drawRectangle({
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            color: rgb(0.88, 0.88, 0.88),
            borderColor: rgb(0.65, 0.65, 0.65),
            borderWidth: 0.5,
          });
          const hatchGap = 6;
          for (let offset = -rh; offset < rw; offset += hatchGap) {
            let sx = rx + offset;
            let sy = ry;
            let ex = rx + offset + rh;
            let ey = ry + rh;
            if (sx < rx) {
              sy += rx - sx;
              sx = rx;
            }
            if (ex > rx + rw) {
              ey -= ex - (rx + rw);
              ex = rx + rw;
            }
            if (ex > sx) {
              page.drawLine({
                start: { x: sx, y: sy },
                end: { x: ex, y: ey },
                thickness: 0.5,
                color: rgb(0.65, 0.65, 0.65),
              });
            }
          }
        });

        // 配置された各パーツ（カット番号・切断寸法を表示）
        sheet.placed.forEach((piece) => {
          const px = originX + piece.x * scale;
          const py = originTopY - (piece.y + piece.heightMm) * scale;
          const pw = piece.widthMm * scale;
          const ph = piece.heightMm * scale;
          const color = sheetColorMap.get(`${piece.widthMm}x${piece.heightMm}`) ?? ([0.9, 0.9, 0.9] as const);
          page.drawRectangle({
            x: px,
            y: py,
            width: pw,
            height: ph,
            color: rgb(color[0], color[1], color[2]),
            borderColor: black,
            borderWidth: 1,
          });

          const numLabel = `No.${piece.cutNumber}`;
          const dimLabel = `${piece.widthMm}×${piece.heightMm}`;
          const numLabelWidth = fontBold.widthOfTextAtSize(numLabel, 8);
          const dimLabelWidth = fontRegular.widthOfTextAtSize(dimLabel, 7);
          if (pw > 30 && ph > 16) {
            page.drawText(numLabel, {
              x: px + pw / 2 - numLabelWidth / 2,
              y: py + ph / 2 + 1,
              size: 8,
              font: fontBold,
              color: black,
            });
            if (ph > 24) {
              page.drawText(dimLabel, {
                x: px + pw / 2 - dimLabelWidth / 2,
                y: py + ph / 2 - 9,
                size: 7,
                font: fontRegular,
                color: gray,
              });
            }
            // 「No.1」だけではどのパーツか分からないため、十分な高さがあるピースには
            // パーツ名（piece.label、例:「天板」「脚（前左）」）もNo.Xの上にもう1行表示する。
            // 一覧表（カット依頼リスト）の備考列には既にlabelが入っているため、ここは
            // スペースが無い小さいピースでは無理に表示しない（既存の省略しきい値と同じ考え方）
            if (piece.label && ph > 34) {
              const partLabelWidth = fontBold.widthOfTextAtSize(piece.label, 7);
              if (partLabelWidth + 4 < pw) {
                page.drawText(piece.label, {
                  x: px + pw / 2 - partLabelWidth / 2,
                  y: py + ph / 2 + 11,
                  size: 7,
                  font: fontBold,
                  color: brand,
                });
              }
            }
          }
        });

        cursorY = originY - 18;
      });
    });

    cursorY -= 4;
  }

  // ---------- カット依頼リスト ----------
  const flatCutList = [
    ...materialGroups.flatMap((group) =>
      group.parts.map((part) => ({ material: group.name, lengthMm: `${part.sizeMm}`, qty: part.qty, note: '' }))
    ),
    ...sheetLayouts.flatMap((layout) =>
      layout.parts.map((part) => ({
        material: layout.name,
        lengthMm: `${part.widthMm}×${part.heightMm}`,
        qty: part.qty,
        // パーツ名（例: 天板・棚板1）。ブラウザCAD経由のsheetLayoutのみ持つ情報
        note: part.label ?? '',
      }))
    ),
  ];

  const columns = [
    { label: '材質', width: 190 },
    { label: '長さ (mm)', width: 100 },
    { label: '数量', width: 70 },
    { label: '備考', width: 0 },
  ];
  columns[columns.length - 1].width =
    tableWidth - columns.slice(0, -1).reduce((sum, c) => sum + c.width, 0);

  const rowHeight = 21;
  ensureSpace(20 + rowHeight * (flatCutList.length + 1));

  page.drawText('■ カット依頼リスト', { x: margin, y: cursorY, size: 13, font: fontBold, color: black });
  cursorY -= 20;

  const tableTop = cursorY;

  const drawRow = (idx: number, cells: string[], isHeader: boolean) => {
    const rowY = tableTop - rowHeight * (idx + 1);
    page.drawRectangle({
      x: margin,
      y: rowY,
      width: tableWidth,
      height: rowHeight,
      color: isHeader ? rgb(0.95, 0.95, 0.95) : undefined,
      borderColor: border,
      borderWidth: 1,
    });
    let x = margin;
    cells.forEach((cellText, ci) => {
      page.drawText(cellText, {
        x: x + 8,
        y: rowY + 7,
        size: 9.5,
        font: isHeader ? fontBold : fontRegular,
        color: black,
      });
      x += columns[ci].width;
    });
  };

  drawRow(0, columns.map((c) => c.label), true);
  flatCutList.forEach((item, i) => {
    drawRow(i + 1, [item.material, `${item.lengthMm}`, `${item.qty}`, item.note], false);
  });

  cursorY = tableTop - rowHeight * (flatCutList.length + 1) - 20;

  // ---------- お名前 / 店舗記入欄 ----------
  const bottomBoxHeight = 42;
  const footerQrSize = 42;
  const footerBlockHeight = 16 + footerQrSize + 20;
  ensureSpace(bottomBoxHeight + footerBlockHeight);

  const nameBoxWidth = tableWidth * 0.5;
  const staffBoxWidth = (tableWidth - nameBoxWidth) / 2;

  page.drawRectangle({
    x: margin,
    y: cursorY - bottomBoxHeight,
    width: nameBoxWidth,
    height: bottomBoxHeight,
    borderColor: border,
    borderWidth: 1,
  });
  page.drawText('お名前', { x: margin + 8, y: cursorY - 16, size: 9, font: fontBold, color: gray });
  page.drawLine({
    start: { x: margin + 8, y: cursorY - bottomBoxHeight + 12 },
    end: { x: margin + nameBoxWidth - 8, y: cursorY - bottomBoxHeight + 12 },
    thickness: 0.75,
    color: gray,
  });

  page.drawRectangle({
    x: margin + nameBoxWidth,
    y: cursorY - bottomBoxHeight,
    width: staffBoxWidth,
    height: bottomBoxHeight,
    borderColor: border,
    borderWidth: 1,
  });
  page.drawText('受付者', {
    x: margin + nameBoxWidth + 8,
    y: cursorY - 16,
    size: 9,
    font: fontBold,
    color: gray,
  });
  page.drawText('※店舗記入欄', {
    x: margin + nameBoxWidth + 8,
    y: cursorY - 28,
    size: 6.5,
    font: fontRegular,
    color: gray,
  });

  page.drawRectangle({
    x: margin + nameBoxWidth + staffBoxWidth,
    y: cursorY - bottomBoxHeight,
    width: staffBoxWidth,
    height: bottomBoxHeight,
    borderColor: border,
    borderWidth: 1,
  });
  page.drawText('カット回数', {
    x: margin + nameBoxWidth + staffBoxWidth + 8,
    y: cursorY - 16,
    size: 9,
    font: fontBold,
    color: gray,
  });
  page.drawText('※店舗記入欄', {
    x: margin + nameBoxWidth + staffBoxWidth + 8,
    y: cursorY - 28,
    size: 6.5,
    font: fontRegular,
    color: gray,
  });

  // ---------- フッター：ブランド表記 + とみしんチャンネルDIY（YouTube）QRコード ----------
  const footerQrY = cursorY - bottomBoxHeight - 16 - footerQrSize;
  page.drawImage(youtubeQrImage, { x: margin, y: footerQrY, width: footerQrSize, height: footerQrSize });
  page.drawText('TANE PROJECT', {
    x: margin + footerQrSize + 12,
    y: footerQrY + footerQrSize - 13,
    size: 11,
    font: fontBold,
    color: black,
  });
  page.drawText('Powered by とみしんチャンネルDIY', {
    x: margin + footerQrSize + 12,
    y: footerQrY + footerQrSize - 28,
    size: 9,
    font: fontRegular,
    color: gray,
  });

  const today = new Date().toLocaleDateString('ja-JP');
  page.drawText(`作成日: ${today}　TANE:iが作成しました`, {
    x: margin,
    y: footerQrY - 14,
    size: 8,
    font: fontRegular,
    color: gray,
  });

  return pdfDoc.save();
};
