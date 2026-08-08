// FreeCADのSpreadsheet機能から書き出されたCSV/JSONの部品リストをパースする。
// FreeCAD側の列名は現場ごとに揺れる可能性があるため、日本語・英語どちらの列名でも
// 受け付けられるよう緩めのエイリアス解決を行う（依存ライブラリなしの最小実装）。
import type { RawPart } from './types';

const HEADER_ALIASES: Record<keyof RawPart, string[]> = {
  name: ['品名', '名前', 'name', 'label', 'part', 'partname'],
  widthMm: ['幅', 'w', 'width', 'widthmm'],
  depthMm: ['奥行', '奥行き', 'd', 'depth', 'depthmm', 'height', 'heightmm'],
  thicknessMm: ['厚み', '厚さ', 't', 'thickness', 'thicknessmm'],
  material: ['材質', '素材', 'material'],
  qty: ['枚数', '数量', '個数', 'qty', 'quantity', 'count'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function resolveHeaderIndexes(headers: string[]): Partial<Record<keyof RawPart, number>> {
  const normalized = headers.map(normalizeHeader);
  const result: Partial<Record<keyof RawPart, number>> = {};

  (Object.keys(HEADER_ALIASES) as (keyof RawPart)[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field].map(normalizeHeader);
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) result[field] = idx;
  });

  return result;
}

function toNumber(value: string | number | undefined, fieldName: string, rowNumber: number): number {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  if (Number.isNaN(num)) {
    throw new Error(`${rowNumber}行目: 「${fieldName}」を数値として読み取れませんでした（値: "${value}"）`);
  }
  return num;
}

// 簡易CSVパーサー。ダブルクォート囲み・カンマ区切りのみサポート（FreeCADのSpreadsheetエクスポート想定）
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parsePartsFromCsv(csvText: string): RawPart[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSVにヘッダー行とデータ行が必要です（ヘッダーのみ、または空のCSVが渡されました）');
  }

  const headers = parseCsvLine(lines[0]);
  const indexes = resolveHeaderIndexes(headers);
  const missing = (Object.keys(HEADER_ALIASES) as (keyof RawPart)[]).filter((f) => indexes[f] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `CSVのヘッダーから次の項目を認識できませんでした: ${missing.join(', ')}\n` +
        `対応している列名の例: 品名/name, 幅/W, 奥行/D, 厚み/T, 材質/material, 枚数/qty`
    );
  }

  return lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    const rowNumber = i + 2; // ヘッダー行を1行目とした実際の行番号
    return {
      name: cells[indexes.name!] ?? `部品${rowNumber}`,
      widthMm: toNumber(cells[indexes.widthMm!], '幅(W)', rowNumber),
      depthMm: toNumber(cells[indexes.depthMm!], '奥行(D)', rowNumber),
      thicknessMm: toNumber(cells[indexes.thicknessMm!], '厚み(T)', rowNumber),
      material: cells[indexes.material!] ?? '不明',
      qty: toNumber(cells[indexes.qty!], '枚数', rowNumber),
    };
  });
}

// JSON入力は、RawPartに近い形（キー名の揺れは吸収する）のオブジェクト配列を想定
export function parsePartsFromJson(jsonText: string): RawPart[] {
  const data: unknown = JSON.parse(jsonText);
  if (!Array.isArray(data)) {
    throw new Error('JSON入力は部品オブジェクトの配列である必要があります');
  }

  return data.map((row, i) => {
    if (typeof row !== 'object' || row === null) {
      throw new Error(`${i + 1}件目: オブジェクトではありません`);
    }
    const lowerCased = Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([k, v]) => [normalizeHeader(k), v])
    );

    const findValue = (field: keyof RawPart): unknown => {
      const aliases = HEADER_ALIASES[field].map(normalizeHeader);
      for (const alias of aliases) {
        if (alias in lowerCased) return lowerCased[alias];
      }
      return undefined;
    };

    const rowNumber = i + 1;
    return {
      name: String(findValue('name') ?? `部品${rowNumber}`),
      widthMm: toNumber(findValue('widthMm') as string | number, '幅(W)', rowNumber),
      depthMm: toNumber(findValue('depthMm') as string | number, '奥行(D)', rowNumber),
      thicknessMm: toNumber(findValue('thicknessMm') as string | number, '厚み(T)', rowNumber),
      material: String(findValue('material') ?? '不明'),
      qty: toNumber(findValue('qty') as string | number, '枚数', rowNumber),
    };
  });
}

// 拡張子・内容から自動判定してパースする
export function parseParts(text: string, filename?: string): RawPart[] {
  const looksLikeJson = filename?.endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{');
  return looksLikeJson ? parsePartsFromJson(text) : parsePartsFromCsv(text);
}
