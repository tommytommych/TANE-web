import { PDFDocument, PageSizes, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { wrapTextToWidth } from './cutSheetPdf';

// サイドバーの「TANE:iカット申込書PDF出力」用：チャットの内容に関わらず、
// 常に手書き記入用の白紙（原紙）を出力する
export const buildBlankCutSheetPdf = async (): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage(PageSizes.A4);
  const { width, height } = page.getSize();

  const [regularFontBytes, boldFontBytes] = await Promise.all([
    fetch('/fonts/MPLUS1p-Regular.ttf').then((res) => res.arrayBuffer()),
    fetch('/fonts/MPLUS1p-Bold.ttf').then((res) => res.arrayBuffer()),
  ]);
  const fontRegular = await pdfDoc.embedFont(regularFontBytes);
  const fontBold = await pdfDoc.embedFont(boldFontBytes);

  const margin = 40;
  const tableWidth = width - margin * 2;

  const brand = rgb(0.086, 0.639, 0.29);
  const brandTint = rgb(0.906, 0.965, 0.925);
  const black = rgb(0.12, 0.12, 0.12);
  const gray = rgb(0.45, 0.45, 0.45);
  const border = rgb(0.75, 0.75, 0.75);
  const gridMinor = rgb(0.88, 0.88, 0.88);
  const gridMajor = rgb(0.68, 0.68, 0.68);

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
  page.drawText('木材カット依頼シート（原紙・手書き用）', {
    x: margin,
    y: height - 58,
    size: 11,
    font: fontRegular,
    color: rgb(1, 1, 1),
  });

  let cursorY = height - headerHeight - 16;

  // ---------- 対応店舗の注記 ----------
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
    'サイズは全てミリ（mm）単位でご記入ください。',
    'のこ刃の厚み（約3mm）を見込んで木取りしてください。実際の誤差は店舗の機械により異なります。',
    'カット料金・本数上限・受付ルールは店舗により異なりますので、詳細は各店舗スタッフへご確認ください。',
  ];
  usageNotes.forEach((note) => {
    wrapTextToWidth(`・${note}`, fontRegular, 8.5, tableWidth - 8).forEach((line) => {
      page.drawText(line, { x: margin, y: cursorY, size: 8.5, font: fontRegular, color: gray });
      cursorY -= 12;
    });
  });
  cursorY -= 14;

  // ---------- 木取り図（カット図）：手書き用の方眼スペース ----------
  page.drawText('■ 木取り図（カット図）', { x: margin, y: cursorY, size: 13, font: fontBold, color: black });
  cursorY -= 16;

  wrapTextToWidth(
    '下の方眼を使って、板からの取り方（木取り）と余る端材を自由に書き込んでください。',
    fontRegular,
    8.5,
    tableWidth
  ).forEach((line) => {
    page.drawText(line, { x: margin, y: cursorY, size: 8.5, font: fontRegular, color: gray });
    cursorY -= 11;
  });
  cursorY -= 8;

  const gridTop = cursorY;
  const gridHeight = 230;
  const gridBottom = gridTop - gridHeight;
  const gridSpacing = 12;

  page.drawRectangle({
    x: margin,
    y: gridBottom,
    width: tableWidth,
    height: gridHeight,
    color: rgb(1, 1, 1),
    borderColor: brand,
    borderWidth: 1.5,
  });

  let colIdx = 0;
  for (let x = margin; x <= margin + tableWidth + 0.01; x += gridSpacing) {
    page.drawLine({
      start: { x, y: gridBottom },
      end: { x, y: gridTop },
      thickness: colIdx % 5 === 0 ? 0.6 : 0.3,
      color: colIdx % 5 === 0 ? gridMajor : gridMinor,
    });
    colIdx += 1;
  }
  let rowIdx = 0;
  for (let y = gridBottom; y <= gridTop + 0.01; y += gridSpacing) {
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + tableWidth, y },
      thickness: rowIdx % 5 === 0 ? 0.6 : 0.3,
      color: rowIdx % 5 === 0 ? gridMajor : gridMinor,
    });
    rowIdx += 1;
  }

  cursorY = gridBottom - 26;

  // ---------- カット依頼リスト：空欄の記入用テーブル ----------
  page.drawText('■ カット依頼リスト', { x: margin, y: cursorY, size: 13, font: fontBold, color: black });
  cursorY -= 20;

  const columns = [
    { label: '材質', width: 190 },
    { label: '長さ (mm)', width: 100 },
    { label: '数量', width: 70 },
    { label: '備考', width: 0 },
  ];
  columns[columns.length - 1].width =
    tableWidth - columns.slice(0, -1).reduce((sum, c) => sum + c.width, 0);

  const rowHeight = 24;
  const blankRowCount = 6;
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
        y: rowY + 8,
        size: 9.5,
        font: isHeader ? fontBold : fontRegular,
        color: black,
      });
      x += columns[ci].width;
    });
  };

  drawRow(0, columns.map((c) => c.label), true);
  for (let i = 0; i < blankRowCount; i++) {
    drawRow(i + 1, ['', '', '', ''], false);
  }

  cursorY = tableTop - rowHeight * (blankRowCount + 1) - 26;

  // ---------- お名前 / 店舗記入欄 ----------
  const bottomBoxHeight = 42;
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

  // ---------- フッター ----------
  const today = new Date().toLocaleDateString('ja-JP');
  page.drawText(`作成日: ${today}　TANE:iが作成しました（原紙）`, {
    x: margin,
    y: cursorY - bottomBoxHeight - 20,
    size: 8,
    font: fontRegular,
    color: gray,
  });

  return pdfDoc.save();
};
