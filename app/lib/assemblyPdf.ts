import { PDFDocument, PageSizes, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { wrapTextToWidth } from './cutSheetPdf';
import { DEMO_ASSEMBLY_MANUAL, type AssemblyManual } from './assemblyManual';

// STEP・ネジ位置・注意点・必要な工具・図解付きの組立説明書PDFを生成する
export const buildAssemblyInstructionsPdf = async (
  manual: AssemblyManual = DEMO_ASSEMBLY_MANUAL
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  let page = pdfDoc.addPage(PageSizes.A4);
  let { width, height } = page.getSize();

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
  const cautionTint = rgb(0.996, 0.937, 0.878);
  const cautionBorder = rgb(0.9, 0.58, 0.2);
  const screwColor = rgb(0.85, 0.25, 0.25);

  let cursorY = height - margin;

  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight < margin) {
      page = pdfDoc.addPage(PageSizes.A4);
      ({ width, height } = page.getSize());
      cursorY = height - margin;
      page.drawText('TANE:i 組立説明書（続き）', {
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
  page.drawText('TANE:i 組立説明書', {
    x: margin,
    y: height - 36,
    size: 19,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(manual.title, {
    x: margin,
    y: height - 58,
    size: 11,
    font: fontRegular,
    color: rgb(1, 1, 1),
  });

  cursorY = height - headerHeight - 20;

  // ---------- 必要な工具 ----------
  page.drawText('🔧 必要な工具', { x: margin, y: cursorY, size: 13, font: fontBold, color: black });
  cursorY -= 20;

  {
    let x = margin;
    const pillHeight = 20;
    const pillGap = 8;
    manual.tools.forEach((tool) => {
      const textWidth = fontRegular.widthOfTextAtSize(tool, 9.5);
      const pillWidth = textWidth + 20;
      if (x + pillWidth > margin + tableWidth) {
        x = margin;
        cursorY -= pillHeight + pillGap;
      }
      page.drawRectangle({
        x,
        y: cursorY - pillHeight,
        width: pillWidth,
        height: pillHeight,
        color: brandTint,
        borderColor: brand,
        borderWidth: 1,
      });
      page.drawText(tool, {
        x: x + 10,
        y: cursorY - pillHeight + 6,
        size: 9.5,
        font: fontRegular,
        color: rgb(0.05, 0.4, 0.18),
      });
      x += pillWidth + pillGap;
    });
    cursorY -= pillHeight + 18;
  }

  // ---------- 全体の注意点 ----------
  if (manual.overallCautions && manual.overallCautions.length > 0) {
    const lines = manual.overallCautions.flatMap((c) => wrapTextToWidth(`・${c}`, fontRegular, 9, tableWidth - 36));
    const boxHeight = 22 + lines.length * 13;
    ensureSpace(boxHeight + 16);

    page.drawRectangle({
      x: margin,
      y: cursorY - boxHeight,
      width: tableWidth,
      height: boxHeight,
      color: cautionTint,
      borderColor: cautionBorder,
      borderWidth: 1,
    });
    page.drawText('⚠️ 全体の注意点', {
      x: margin + 12,
      y: cursorY - 16,
      size: 10.5,
      font: fontBold,
      color: rgb(0.6, 0.35, 0.05),
    });
    let lineY = cursorY - 32;
    lines.forEach((line) => {
      page.drawText(line, { x: margin + 12, y: lineY, size: 9, font: fontRegular, color: rgb(0.4, 0.28, 0.08) });
      lineY -= 13;
    });
    cursorY -= boxHeight + 18;
  }

  // ---------- STEP一覧 ----------
  const diagramWidth = 160;
  const diagramHeight = 120;
  const columnGap = 18;

  manual.steps.forEach((step) => {
    const hasDiagram = !!step.panelLabel || (step.screwPositions && step.screwPositions.length > 0);
    const textColumnWidth = hasDiagram ? tableWidth - diagramWidth - columnGap : tableWidth;

    const descLines = wrapTextToWidth(step.description, fontRegular, 9.5, textColumnWidth);
    const cautionLines = (step.cautions ?? []).flatMap((c) =>
      wrapTextToWidth(`・${c}`, fontRegular, 8.5, textColumnWidth - 20)
    );
    const cautionBoxHeight = cautionLines.length > 0 ? 16 + cautionLines.length * 12 + 8 : 0;

    const screwNoteLines =
      step.screwPositions && step.screwPositions.length > 0
        ? wrapTextToWidth(
            `🔩 ネジ位置: ${step.screwPositions.map((s, i) => `${i + 1}:${s.note ?? 'ネジ'}`).join('　')}`,
            fontRegular,
            7,
            diagramWidth
          )
        : [];

    const textBlockHeight = 26 + descLines.length * 13 + cautionBoxHeight;
    const diagramBlockHeight = hasDiagram ? diagramHeight + 26 + screwNoteLines.length * 9 : 0;
    const blockHeight = Math.max(textBlockHeight, diagramBlockHeight);

    ensureSpace(blockHeight + 26);

    const blockTop = cursorY;

    // ---- STEPバッジ + タイトル ----
    const badgeText = `STEP ${step.stepNumber}`;
    const badgeWidth = fontBold.widthOfTextAtSize(badgeText, 10) + 16;
    page.drawRectangle({ x: margin, y: blockTop - 20, width: badgeWidth, height: 20, color: brand });
    page.drawText(badgeText, {
      x: margin + 8,
      y: blockTop - 15,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText(step.title, {
      x: margin + badgeWidth + 10,
      y: blockTop - 15,
      size: 12,
      font: fontBold,
      color: black,
    });

    let textY = blockTop - 34;
    descLines.forEach((line) => {
      page.drawText(line, { x: margin, y: textY, size: 9.5, font: fontRegular, color: black });
      textY -= 13;
    });

    if (cautionLines.length > 0) {
      textY -= 6;
      const boxTop = textY + 4;
      page.drawRectangle({
        x: margin,
        y: boxTop - cautionBoxHeight,
        width: textColumnWidth,
        height: cautionBoxHeight,
        color: cautionTint,
        borderColor: cautionBorder,
        borderWidth: 0.75,
      });
      let cautionY = boxTop - 14;
      page.drawText('⚠️ 注意点', {
        x: margin + 8,
        y: cautionY,
        size: 8.5,
        font: fontBold,
        color: rgb(0.6, 0.35, 0.05),
      });
      cautionY -= 13;
      cautionLines.forEach((line) => {
        page.drawText(line, { x: margin + 8, y: cautionY, size: 8.5, font: fontRegular, color: rgb(0.4, 0.28, 0.08) });
        cautionY -= 12;
      });
    }

    // ---- ネジ位置の図解（パネル図 + マーカー） ----
    if (hasDiagram) {
      const diagX = margin + textColumnWidth + columnGap;
      const diagTopY = blockTop - 20;
      const diagBottomY = diagTopY - diagramHeight;

      page.drawRectangle({
        x: diagX,
        y: diagBottomY,
        width: diagramWidth,
        height: diagramHeight,
        color: rgb(0.97, 0.95, 0.9),
        borderColor: border,
        borderWidth: 1,
      });

      if (step.panelLabel) {
        const labelWidth = fontBold.widthOfTextAtSize(step.panelLabel, 8.5);
        page.drawText(step.panelLabel, {
          x: diagX + diagramWidth / 2 - labelWidth / 2,
          y: diagTopY - 12,
          size: 8.5,
          font: fontBold,
          color: gray,
        });
      }

      (step.screwPositions ?? []).forEach((screw, i) => {
        const cx = diagX + (screw.xPct / 100) * diagramWidth;
        const cy = diagTopY - (screw.yPct / 100) * diagramHeight;
        const r = 4;
        page.drawEllipse({ x: cx, y: cy, xScale: r, yScale: r, color: screwColor });
        page.drawText(`${i + 1}`, {
          x: cx - 2.5,
          y: cy - 3,
          size: 6.5,
          font: fontBold,
          color: rgb(1, 1, 1),
        });
      });

      screwNoteLines.forEach((line, i) => {
        page.drawText(line, {
          x: diagX,
          y: diagBottomY - 11 - i * 9,
          size: 7,
          font: fontRegular,
          color: gray,
        });
      });
    }

    cursorY = blockTop - blockHeight - 26;

    // ---- ステップ間の区切り線 ----
    page.drawLine({
      start: { x: margin, y: cursorY + 12 },
      end: { x: margin + tableWidth, y: cursorY + 12 },
      thickness: 0.5,
      color: border,
    });
  });

  // ---------- フッター ----------
  const today = new Date().toLocaleDateString('ja-JP');
  ensureSpace(20);
  page.drawText(`作成日: ${today}　TANE:iが作成しました`, {
    x: margin,
    y: cursorY - 6,
    size: 8,
    font: fontRegular,
    color: gray,
  });

  return pdfDoc.save();
};
