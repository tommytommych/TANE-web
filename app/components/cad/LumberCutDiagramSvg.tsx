'use client';

// 規格材（SPF材等、getFurnitureMaterialTypeが'dimensionalLumber'と判定する材料）専用の
// カット図。テーブルの脚・幕板のように「板」ではなく「決まった長さの1本の材料」から
// 切り出すパーツは、サブロク板の木取り図（app/components/chat/SheetLayoutSvg.tsx）には
// 描けないため、代わりに「材料を横長の棒として表示し、そこから何をどれだけ切り出すか」
// という別のカット図を用意する。1次元ビンパッキング（何本必要か・どこで切るか）は、
// AIチャットの木取りカット図PDF（app/lib/cutSheetPdf.ts）が既に持つpackMaterialGroupを
// そのまま再利用し、新しい計算ロジックは作らない。

import { memo, useMemo } from 'react';
import { packMaterialGroup } from '../../lib/cutSheetPdf';
import type { MaterialGroup } from '../../lib/cutlist';
import type { CutListItem } from '../../lib/cad/model';

interface LumberCutDiagramSvgProps {
  material: string;
  group: MaterialGroup;
  /** 同じ材料のCutListItem一覧。カット図内の各セグメントに部材名（例:「脚」）を
   * 表示するためだけに使う（packMaterialGroup自体はサイズ（mm）しか扱わないため） */
  items: CutListItem[];
}

const PASTEL_COLORS = ['#FBD9D9', '#D4E8FA', '#DCF5D9', '#FDECC7', '#EADAF7', '#FAF7C7', '#CCF2EF', '#FADCF0'];

const createSizeColorMap = (group: MaterialGroup): Map<number, string> => {
  const sizes = Array.from(new Set(group.parts.map((p) => p.sizeMm))).sort((a, b) => b - a);
  const map = new Map<number, string>();
  sizes.forEach((size, i) => map.set(size, PASTEL_COLORS[i % PASTEL_COLORS.length]));
  return map;
};

function LumberCutDiagramSvgView({ material, group, items }: LumberCutDiagramSvgProps) {
  // 1次元ビンパッキング（First Fit Decreasing、app/lib/cutSheetPdf.tsのpackMaterialGroupと
  // 完全に同じアルゴリズム）の計算はそれなりにコストがかかるため、groupが変わらない限り
  // 再計算しない（SheetLayoutSvg.tsxのuseMemoと同じ考え方）
  const boards = useMemo(() => packMaterialGroup(group), [group]);
  const colorMap = useMemo(() => createSizeColorMap(group), [group]);
  // 同じ長さの部材が複数種類あるケース（脚675mm・幕板675mmが偶然重なる等）は稀なため、
  // 最初に一致したものの名前を使う（安全側：表示上の見やすさのための簡略化であり、
  // 実際のカット本数・寸法（packMaterialGroupの結果）には一切影響しない）
  const labelForSize = (sizeMm: number): string => items.find((item) => item.widthMm === sizeMm)?.name ?? '';

  if (boards.length === 0) return null;

  const padding = 10;
  const barHeight = 40;
  const scale = 460 / group.boardLengthMm;
  const barWidthPx = group.boardLengthMm * scale;
  const svgWidth = barWidthPx + padding * 2;
  const svgHeight = barHeight + padding * 2;
  const hatchId = `lumber-hatch-${material}`;

  return (
    <div className="bg-white border border-tanei-border rounded-tanei-control p-3">
      <div className="text-xs font-bold text-tanei-ink mb-1">📐 {material} のカット図</div>
      <div className="text-[11px] text-tanei-ink-muted mb-2">
        {group.name}　規格材の長さ：{group.boardLengthMm}mm　必要本数：
        <span className="font-black text-tanei-brand">{boards.length}本</span>
      </div>
      <div className="text-[11px] text-tanei-ink-muted mb-2">
        使用する規格材：
        {items.map((item) => (
          <span key={item.id} className="ml-1.5">
            ・{item.name} ×{item.qty}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {boards.map((board, boardIdx) => (
          <div key={boardIdx}>
            {boards.length > 1 && (
              <div className="text-[11px] font-bold text-tanei-ink-muted mb-0.5">{boardIdx + 1}本目</div>
            )}
            <svg
              width="100%"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="max-w-full"
              role="img"
              aria-label={`${material} ${group.boardLengthMm}mmの${boardIdx + 1}本目。カット${board.pieces.length}個、余り約${Math.round(board.leftoverMm)}mm`}
            >
              <defs>
                <pattern id={hatchId} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#B8B0A6" strokeWidth="1.5" />
                </pattern>
              </defs>

              {/* 規格材の全長を表す背景枠 */}
              <rect x={padding} y={padding} width={barWidthPx} height={barHeight} fill="#F3EFE6" stroke="#3A2F27" strokeWidth={1.5} />

              {(() => {
                let x = padding;
                return board.pieces.map((size, pieceIdx) => {
                  const pieceWidthPx = size * scale;
                  const color = colorMap.get(size) ?? '#EEEEEE';
                  const label = labelForSize(size);
                  const showSize = pieceWidthPx > 30;
                  const showLabel = pieceWidthPx > 46 && Boolean(label);
                  const rect = (
                    <g key={pieceIdx}>
                      <rect x={x} y={padding} width={pieceWidthPx} height={barHeight} fill={color} stroke="#3A2F27" strokeWidth={1} />
                      {showLabel && (
                        <text x={x + pieceWidthPx / 2} y={padding + barHeight / 2 - 5} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#16A34A">
                          {label}
                        </text>
                      )}
                      {showSize && (
                        <text
                          x={x + pieceWidthPx / 2}
                          y={padding + barHeight / 2 + (showLabel ? 10 : 4)}
                          textAnchor="middle"
                          fontSize={9}
                          fill="#3A2F27"
                        >
                          {size}mm
                        </text>
                      )}
                    </g>
                  );
                  x += pieceWidthPx;
                  return rect;
                });
              })()}

              {/* 余り（未使用の長さ） */}
              {board.leftoverMm > 0.5 &&
                (() => {
                  const leftoverX = padding + board.usedMm * scale;
                  const leftoverWidthPx = board.leftoverMm * scale;
                  const showLeftoverLabel = leftoverWidthPx > 40;
                  return (
                    <g>
                      <rect x={leftoverX} y={padding} width={leftoverWidthPx} height={barHeight} fill={`url(#${hatchId})`} stroke="#B8B0A6" strokeWidth={0.75} />
                      {showLeftoverLabel && (
                        <text x={leftoverX + leftoverWidthPx / 2} y={padding + barHeight / 2 + 4} textAnchor="middle" fontSize={8.5} fill="#7A6B5D">
                          余り{Math.round(board.leftoverMm)}mm
                        </text>
                      )}
                    </g>
                  );
                })()}
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(LumberCutDiagramSvgView);
