# FreeCAD連携機能 — 独立プロトタイプ（Phase 1）

「TANE:i」のAI画像生成（Gemini等）だけでは担保しきれない、DIY実務における寸法・構造の
精密さを補うため、FreeCADの高精度な3D設計データを起点に木取り・設計最適化を行うための
独立モジュール。TANE:iのメインリポジトリ（`app/`以下のNext.jsアプリ）とは意図的に切り離し、
依存関係を持たない単体のNode.jsパッケージとして実装している。

## Phase 1（本プロトタイプの範囲）

1. **入力データの受付**（`src/parseParts.ts`）
   FreeCADのSpreadsheetから書き出したCSV・JSON形式の部品リスト（品名・幅・奥行・厚み・
   材質・枚数）をパースする。列名は日本語・英語どちらの表記にも対応（例: 幅 / W / width）。

2. **最適化アルゴリズム**（`src/optimizer.ts`, `src/boardSizes.ts`, `src/analyze.ts`）
   部品を材質・厚みごとにグルーピングし、それぞれに収まる最小のホームセンター定尺サイズ
   （サブロク板 910×1820mm、シハチ板 1210×2430mm）を選定した上で、2次元ギロチンカット
   方式のビンパッキング（TANE:i本体 `app/lib/sheetLayout.ts` で実績のあるアルゴリズムを、
   依存なしで移植）により木取り図と必要枚数を自動算出する。

3. **可視化**（`src/svgExport.ts`）
   算出した木取り図を、板1枚ごとにSVGとして書き出す（Phase 2の画像/PDF出力の土台）。

## 使い方

```bash
cd freecad-integration
npm install
npm run analyze -- examples/sample-parts.csv
# または
npm run analyze -- examples/sample-parts.json output-dir
```

コンソールに木取り結果（使用定尺・必要枚数・歩留まり・配置座標）が表示され、
`output/`（省略時）以下に板ごとのSVGファイルが書き出される。

## Phase 2 に向けて（未実装・今後の統合方針）

- `src/index.ts` の `analyzePartsText()` を、TANE:iのAPIルート（`app/api/...`）から
  直接importして呼び出せる形にする（本パッケージはNext.js非依存のため、そのまま
  `app/lib`配下やモノレポのワークスペースパッケージとして取り込みやすい設計にしてある）。
- 木取り図の出力をSVGに加えてPDF化する（TANE:i本体の`app/lib/cutSheetPdf.ts`が
  pdf-libで同種の描画を行っており、実装パターンを流用できる）。
- 材料費の合算リスト（材質・厚みごとの単価テーブルを追加し、必要枚数×単価で概算費用を返す）。
- LINE版からの呼び出し導線（部品リストのアップロード方法の検討：LINEはファイル送信に
  制約があるため、テキスト貼り付け or 外部フォーム経由でのCSV受け取りなどを想定）。

## ディレクトリ構成

```
freecad-integration/
  src/
    types.ts        # 型定義（RawPart, BoardSize, PackedBoard, AnalysisResult 等）
    parseParts.ts    # CSV/JSONパーサー
    boardSizes.ts    # 定尺サイズのプリセットと選定ロジック
    optimizer.ts     # 2次元ビンパッキング（木取り計算の中核）
    analyze.ts       # 材質・厚みごとのグルーピング＋最適化の統合
    svgExport.ts     # 木取り図のSVG書き出し
    index.ts         # 公開API（Phase2でのモジュール利用を想定）
    cli.ts           # 動作確認用のCLIスクリプト
  examples/
    sample-parts.csv
    sample-parts.json
```
