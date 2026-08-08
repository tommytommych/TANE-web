#!/usr/bin/env node
// 最小限のプロトタイプ用CLI。
// 使い方: npx tsx src/cli.ts <部品リストのCSVまたはJSONファイル> [出力先ディレクトリ]
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { analyzePartsText } from './index';
import { boardToSvg } from './svgExport';

function main() {
  const [, , inputPath, outputDirArg] = process.argv;

  if (!inputPath) {
    console.error('使い方: npx tsx src/cli.ts <部品リストのCSVまたはJSONファイル> [出力先ディレクトリ]');
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
  }

  const outputDir = outputDirArg ?? 'output';
  const text = readFileSync(inputPath, 'utf-8');

  let result;
  try {
    result = analyzePartsText(text, inputPath);
  } catch (error) {
    console.error('部品リストの解析に失敗しました:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log(`\n=== 木取り解析結果（入力: ${basename(inputPath)}） ===\n`);

  result.groups.forEach((group) => {
    console.log(`■ 材質: ${group.material}　厚み: ${group.thicknessMm}mm`);
    console.log(`  使用する定尺: ${group.boardSize.label}`);
    console.log(`  必要枚数: ${group.totalBoardsNeeded}枚`);
    console.log(`  平均歩留まり: ${(group.averageYieldRate * 100).toFixed(1)}%`);

    group.boards.forEach((board) => {
      console.log(`  --- ${board.boardIndex}枚目（歩留まり ${(board.yieldRate * 100).toFixed(1)}%） ---`);
      board.placed.forEach((p) => {
        console.log(
          `    #${p.cutNumber} ${p.name}: ${p.widthMm}×${p.heightMm}mm at (${p.x}, ${p.y})${p.rotated ? ' [回転]' : ''}`
        );
      });
    });

    if (group.unplacedParts.length > 0) {
      console.log(`  ⚠ 配置できなかった部品: ${group.unplacedParts.length}件`);
    }
    console.log('');
  });

  console.log(`合計必要枚数（全材質合算）: ${result.totalBoardsAllGroups}枚`);

  if (result.warnings.length > 0) {
    console.log('\n--- 警告 ---');
    result.warnings.forEach((w) => console.log(`⚠ ${w}`));
  }

  // 各板の木取り図をSVGとして書き出す
  mkdirSync(outputDir, { recursive: true });
  let svgCount = 0;
  result.groups.forEach((group, groupIdx) => {
    group.boards.forEach((board) => {
      const filename = `group${groupIdx + 1}_${group.material}_t${group.thicknessMm}_board${board.boardIndex}.svg`;
      const safeFilename = filename.replace(/[^\w.\-一-龥ぁ-んァ-ヶー]/g, '_');
      writeFileSync(join(outputDir, safeFilename), boardToSvg(board), 'utf-8');
      svgCount += 1;
    });
  });

  console.log(`\n${svgCount}件の木取り図SVGを ${outputDir}/ に書き出しました。`);
}

main();
