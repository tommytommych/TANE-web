# TANE:i FreeCAD Studio（独立プロトタイプ）

Gemini等の画像生成AIに頼らず、FreeCADをバックエンドで動かして正確な寸法・構造に基づく
完成イメージのレンダリングと木取りデータを直接出力する、既存のTANE:iメインシステム
（Next.js／`app/`以下）とは完全に独立したアプリケーション。単体のFlaskサーバー＋
シンプルなHTML/JSフロントエンドとして、このリポジトリの外に置いても成立するように作ってある。

## ⚠️ 重要：このコードの検証状況について

開発に使用したサンドボックス環境には **FreeCADもPOV-Rayもインストールされていない**
（`brew`すら使えない環境だったため、その場でのインストールもできなかった）。
そのため、「本番のFreeCAD＋POV-Rayパイプライン」と「開発用の簡易プレビューモード」を
分けて実装し、検証済みの範囲と未検証の範囲を以下の通り明確にしている。

### 開発用の簡易プレビューモード（動作確認済み・今すぐ動く）

`FREECAD_CMD_PATH`（デフォルト`freecadcmd`）が見つからない環境では、サーバーが自動的に
`mock_preview.py`にフォールバックする。実際の寸法計算（`compute_panels`）と木取りCSV生成
（`write_cutlist_csv`）は本番と全く同じロジックを使い、完成イメージ部分だけを
「等角投影（アイソメトリック）のSVG」で代用する。フロントエンドには
「⚠ 簡易プレビュー表示中」のバッジが表示され、本番レンダリングと混同しないようにしている。

このモードは実際にサーバーを起動し、ブラウザから複数の寸法・材質パターン（例:
W1200×D400×H400のテレビ台、W600×D300×H1800の縦長シェルフ）で送信して、寸法通りの
プロポーションの図・正しい木取りCSVが表示されることを確認済み。**この開発環境でも
今すぐ`python3 server.py`で動かして一通り試すことができる。**

### 本番のFreeCAD＋POV-Rayパイプライン（未検証・別環境での確認が必要）

**実際に動作確認できたもの:**
- `freecad_scripts/generate_model.py` 内の純粋なPythonロジック（寸法計算・CSV木取りリスト
  生成・POV-Rayシーンのテキスト生成）は、FreeCADを介さず直接呼び出して動作を確認済み
- FreeCAD／POV-Rayが見つからない場合のエラーハンドリングが、生のPythonエラーではなく
  分かりやすい日本語メッセージになることを確認済み
- Flaskサーバーの入力値検証（範囲外の寸法・材質未指定でHTTP 400）を実際のHTTPリクエストで確認済み

**未検証（このコードが書かれた環境ではFreeCAD/POV-Rayを実行できないため）:**
- `freecadcmd`によるFreeCADドキュメント（.FCStd）の実際の生成
- `povray`による実際のレンダリング（.povファイルの構文はブレース対応など静的にチェック
  したのみで、実際にPOV-Rayでレンダリングして見た目を確認したわけではない）
- 本番パイプラインでのエンドツーエンド（フォーム送信→FreeCAD実行→POV-Rayレンダリング→
  画像表示）の完全な動作

**つまり、UI・API・木取り計算・簡易プレビューは今すぐこの環境で試せるが、本物の
FreeCAD＋POV-Rayによる写実的なレンダリングだけは、それらがインストールされた環境で
改めて確認していただく必要がある。** 下記の「セットアップ」の手順で、うまくいかない
箇所があれば教えてほしい（特にFreeCADのバージョンによってPythonモジュールの挙動が
変わることがあるため、そこが最も調整が必要になりやすい）。

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

Flaskを経由せず、`generate_model.py`単体でも実行できる:

```bash
freecadcmd freecad_scripts/generate_model.py -- \
  --item "テレビ台" --width 1200 --depth 400 --height 400 \
  --material "パイン集成材" --output-dir ./renders/test001
```

`./renders/test001/` に `model.FCStd` / `cutlist.csv` / `scene.pov` / `render.png` が
生成されれば成功。

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
