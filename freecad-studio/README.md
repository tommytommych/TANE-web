# TANE:i FreeCAD Studio（独立プロトタイプ）

Gemini等の画像生成AIに頼らず、FreeCADをバックエンドで動かして正確な寸法・構造に基づく
完成イメージのレンダリングと木取りデータを直接出力する、既存のTANE:iメインシステム
（Next.js／`app/`以下）とは完全に独立したアプリケーション。単体のFlaskサーバー＋
シンプルなHTML/JSフロントエンドとして、このリポジトリの外に置いても成立するように作ってある。

## ✅ 動作確認済み（本番のFreeCAD＋POV-Rayパイプライン含む）

開発当初はサンドボックス環境にFreeCAD/POV-Rayが無く未検証だったが、その後
実際にFreeCAD 1.1.3 + POV-Ray 3.7（Homebrew版）をインストールし、**本番パイプライン
（フォーム送信→freecadcmdでFreeCADドキュメント生成→POV-Rayでレンダリング→
ブラウザに完成イメージ＋木取り表を表示）をエンドツーエンドで実際に動作確認済み。**
複数の寸法・材質パターン（例: W1200×D400×H400のテレビ台、W600×D250×H1500の
シェルフ×ラワン合板）で、それぞれ寸法・材質色ともに正しい完成イメージPNGと
木取りCSVが得られることを確認した。

この過程で、FreeCAD/POV-Rayの実機でしか発覚しない以下の不具合を発見・修正済み:

1. **`freecadcmd`は独自のCLIパーサーを持ち、一般的な`script.py -- args`という
   「`--`以降はスクリプトへそのまま渡す」慣習を尊重しない。** 出力先ディレクトリの
   パスをFreeCAD自身が開くべきドキュメントと誤認識し「File format not supported」
   エラーになった。→ パラメータをコマンドライン引数ではなく環境変数
   `TANEI_PARAMS_JSON`（JSON文字列）で渡す方式に変更して解決。
2. **`freecadcmd`はスクリプトを「モジュールとしてimportする」形で実行し、
   `__name__`が`"__main__"`にならない。** そのため`if __name__ == "__main__":`
   ガードでは`main()`が一度も呼ばれず、エラーも出さずに何もしないまま終了していた。
   → `TANEI_PARAMS_JSON`環境変数の有無をトリガー条件に変更して解決。
3. **`freecadcmd`経由の実行では、`print()`の標準出力がサブプロセスのキャプチャに
   確実に反映されない**（バッファリングか、異常終了時にflushされないことが原因と
   推測）。→ 結果・エラーを標準出力ではなく`result.json`ファイルへの書き込みに変更し、
   呼び出し元がファイルを読む方式に変更して解決。
4. **POV-Rayの`/EXIT`オプションはWindows版専用で、Mac/Linux版では
   「Failed to parse command-line option」として実行自体が失敗する**
   （元々のコードには「Linux/Macでは無視される」という誤ったコメントがあった）。
   → Mac/Linux版povrayは元々レンダリング後に自動終了するため、単純に削除して解決。

開発用の簡易プレビューモード（FreeCAD/POV-Ray未接続時に自動フォールバックする、
等角投影SVGでの代用表示）も引き続き有効で、環境を選ばずすぐに試すことができる。

## アーキテクチャ

```
[ブラウザ] --POST /api/render--> [Flask server.py]
                                        |
                                        | subprocess実行
                                        v
                          freecadcmd generate_model.py
                                        |
                    +-------------------+-------------------+
                    v                                        v
         FreeCADドキュメント(.FCStd)                 木取りCSV + POV-Rayシーン(.pov)
         （将来のTechDraw図面化・寸法検証用）                    |
                                                                v
                                                        povray（サブプロセス実行）
                                                                |
                                                                v
                                                        完成イメージ(PNG)
```

### なぜこの構成にしたか

- **`freecadcmd`をサブプロセスとして呼び出す方式**にした理由: FreeCADの`FreeCAD`/`Part`
  モジュールは、一般的な`pip install`ではなくFreeCAD本体にバンドルされた専用のPython
  インタプリタからしかimportできないことが多い。Flaskサーバー（通常のpython3プロセス）
  から直接importしようとすると環境依存の設定（PYTHONPATHの調整等）が必要になり不安定に
  なりやすいため、「FreeCAD本体に付属するfreecadcmdをサブプロセスとして呼び、標準出力
  経由で結果を受け取る」方式にした。この方式はFreeCADのバージョンやインストール方法が
  変わっても、`FREECAD_CMD_PATH`環境変数を変えるだけで対応できる。

- **POV-Rayのシーンを「メッシュ変換」ではなく「パラメータから直接生成」した理由**:
  FreeCADの形状をPOV-Ray用にエクスポートする一般的な方法（OBJエクスポート→POV-Ray側で
  読み込み）は、変換ツールやFreeCADのバージョンによって不安定になりやすい。今回の家具は
  すべて直方体（天板・底板・側板・背板）の組み合わせなので、FreeCADモデルを組み立てるのに
  使ったのと同じ寸法パラメータから、POV-Rayのネイティブな`box{}`プリミティブを直接
  テキスト生成する方式にした。これによりFreeCADモデルとレンダリング画像が常に同じ数値
  ソースから作られ、ズレる余地がない。将来的に曲面・面取りなど複雑な形状を扱う場合は、
  FreeCADのRenderワークベンチ経由でのメッシュ/マテリアル出力に切り替える必要がある。

## セットアップ

### 1. 前提ソフトウェアのインストール（このリポジトリには含まれない）

- **FreeCAD**: https://www.freecad.org/downloads.php からインストール。
  インストール後、`freecadcmd`（Windowsは`FreeCADCmd.exe`）の実行ファイルパスを確認する。
  - macOS例: `/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd`
  - Linux例: `/usr/bin/freecadcmd` または `/opt/freecad/bin/freecadcmd`
- **POV-Ray**: https://www.povray.org/download/ からインストール。
  - macOS/Linuxはパッケージマネージャ経由でも可（例: `brew install povray`,
    `apt install povray`）

### 2. 環境変数の設定（パスが通っていない場合）

```bash
export FREECAD_CMD_PATH=/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd
export POVRAY_PATH=/usr/local/bin/povray
```

### 3. サーバーの起動

```bash
cd freecad-studio
pip install -r requirements.txt
python3 server.py
```

`http://localhost:5001/` を開き、フォームから寸法・材質を入力して送信する。

### 4. スクリプト単体での動作確認（デバッグ用）

Flaskを経由せず、`generate_model.py`単体でも実行できる（パラメータは環境変数で渡す。
上記「動作確認済み」参照）:

```bash
TANEI_PARAMS_JSON='{"item":"テレビ台","width":1200,"depth":400,"height":400,"thickness":18,"material":"パイン集成材","outputDir":"./renders/test001"}' \
  freecadcmd freecad_scripts/generate_model.py
```

`./renders/test001/` に `model.FCStd` / `cutlist.csv` / `scene.pov` / `render.png` /
`result.json` が生成されれば成功。

## 既知の制約・今後の検討事項

- 現状の家具モデルは「天板・底板・側板×2・背板」の単純な箱型構成のみに対応
  （棚板の追加、引き出し、扉などは未対応）。
- POV-Rayのレンダリングは同期処理でFlaskのリクエストをブロックする（プロトタイプの
  ため）。実運用ではジョブキュー化（Celery等）とポーリング/WebSocketでの進捗通知が必要。
- 材質ごとの色は`generate_model.py`内の簡易テーブル（`MATERIAL_COLORS`）による近似で、
  実際の木目テクスチャなどは反映していない。
- 木取りCSVは `freecad-integration/`（Phase1の木取り最適化プロトタイプ）が読み込める
  スキーマ（品名,幅,奥行,厚み,材質,枚数）に合わせてあるため、複数家具分の部材リストを
  まとめて最適化したい場合はそちらに渡すことができる。
