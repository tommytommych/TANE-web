'use client';

import { memo, useMemo } from 'react';
import { packSheetLayout, type SheetLayout, type PackedSheet } from '../../lib/sheetLayout';
import InfoTip from '../ui/InfoTip';

interface SheetLayoutSvgProps {
  layout: SheetLayout;
  showToast: (msg: string) => void;
}

// パーツのサイズ（幅×高さ）ごとに視認性の良いパステルカラーを割り当てる
const PASTEL_COLORS = [
  '#FBD9D9',
  '#D4E8FA',
  '#DCF5D9',
  '#FDECC7',
  '#EADAF7',
  '#FAF7C7',
  '#CCF2EF',
  '#FADCF0',
];

const createColorMap = (sheets: PackedSheet[]): Map<string, string> => {
  const keys = Array.from(
    new Set(sheets.flatMap((s) => s.placed.map((p) => `${p.widthMm}x${p.heightMm}`)))
  ).sort();
  const map = new Map<string, string>();
  keys.forEach((key, i) => map.set(key, PASTEL_COLORS[i % PASTEL_COLORS.length]));
  return map;
};

// 1枚のシート（板）を1つのSVGとして描画する。板サイズ・カット番号・切断寸法・余り材・歩留まりを表示する
const SheetSvg = ({
  sheet,
  sheetIndex,
  totalSheets,
  colorMap,
  showToast,
}: {
  sheet: PackedSheet;
  sheetIndex: number;
  totalSheets: number;
  colorMap: Map<string, string>;
  showToast: (msg: string) => void;
}) => {
  const padding = 28;
  const scale = 380 / Math.max(sheet.sheetWidthMm, sheet.sheetHeightMm);
  const w = sheet.sheetWidthMm * scale;
  const h = sheet.sheetHeightMm * scale;
  const svgWidth = w + padding * 2;
  const svgHeight = h + padding * 2 + 24;
  const hatchId = `hatch-${sheetIndex}`;

  return (
    <div className="bg-white border border-tanei-border rounded-tanei-control p-3">
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="font-bold text-tanei-ink">
          板サイズ: {sheet.sheetWidthMm} × {sheet.sheetHeightMm}mm
          {totalSheets > 1 && `（${sheetIndex + 1}枚目 / 全${totalSheets}枚）`}
        </span>
        <span className="font-bold text-tanei-brand flex items-center">
          歩留まり: {Math.round(sheet.yieldRate * 100)}%
          <InfoTip
            label="歩留まり"
            explanation="板に対して実際にパーツとして使える割合です。高いほど無駄（端材）が少なく、経済的です。"
            onShow={showToast}
          />
        </span>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="max-w-full"
        role="img"
        aria-label={`板サイズ${sheet.sheetWidthMm}×${sheet.sheetHeightMm}mmの木取り図。パーツ${sheet.placed.length}個を配置、歩留まり${Math.round(sheet.yieldRate * 100)}%`}
      >
        <defs>
          <pattern id={hatchId} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#B8B0A6" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* 板全体の外枠 */}
        <rect
          x={padding}
          y={padding}
          width={w}
          height={h}
          fill="#F3EFE6"
          stroke="#3A2F27"
          strokeWidth={1.5}
        />

        {/* 余り材（未使用エリア） */}
        {sheet.leftoverRects.map((rect, i) => (
          <rect
            key={`leftover-${i}`}
            x={padding + rect.x * scale}
            y={padding + rect.y * scale}
            width={rect.widthMm * scale}
            height={rect.heightMm * scale}
            fill={`url(#${hatchId})`}
            stroke="#B8B0A6"
            strokeWidth={0.75}
          />
        ))}

        {/* 配置された各パーツ（カット番号・切断寸法を表示） */}
        {sheet.placed.map((piece) => {
          const px = padding + piece.x * scale;
          const py = padding + piece.y * scale;
          const pw = piece.widthMm * scale;
          const ph = piece.heightMm * scale;
          const color = colorMap.get(`${piece.widthMm}x${piece.heightMm}`) ?? '#EEEEEE';
          const showLabel = pw > 34 && ph > 18;
          return (
            <g key={piece.cutNumber}>
              <rect x={px} y={py} width={pw} height={ph} fill={color} stroke="#3A2F27" strokeWidth={1} />
              {showLabel && (
                <>
                  <text
                    x={px + pw / 2}
                    y={py + ph / 2 - 3}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="bold"
                    fill="#3A2F27"
                  >
                    No.{piece.cutNumber}
                  </text>
                  <text
                    x={px + pw / 2}
                    y={py + ph / 2 + 10}
                    textAnchor="middle"
                    fontSize={8.5}
                    fill="#5C4B40"
                  >
                    {piece.widthMm}×{piece.heightMm}
                  </text>
                </>
              )}
            </g>
          );
        })}

        <text x={padding} y={svgHeight - 6} fontSize={9} fill="#7A6B5D">
          余り材: 約{Math.round(sheet.leftoverAreaMm2 / 1000)}cm²
        </text>
      </svg>
    </div>
  );
};

// AIの回答に付加されたシート材（合板・MDF等）の木取りデータを、SVGの木取り図として描画する
function SheetLayoutSvgView({ layout, showToast }: SheetLayoutSvgProps) {
  // 2次元ビンパッキングの計算はそれなりにコストがかかるため、layoutが変わらない限り再計算しない
  const sheets = useMemo(() => packSheetLayout(layout), [layout]);
  const colorMap = useMemo(() => createColorMap(sheets), [sheets]);

  if (sheets.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="text-xs font-bold text-tanei-ink">🪚 {layout.name} の木取り図（自動配置）</div>
      {sheets.map((sheet, i) => (
        <SheetSvg key={i} sheet={sheet} sheetIndex={i} totalSheets={sheets.length} colorMap={colorMap} showToast={showToast} />
      ))}
    </div>
  );
}

export default memo(SheetLayoutSvgView);
