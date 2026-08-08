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

## パーツごとの塗装（フィニッシュ）と木目テクスチャ

「天板」「底板」「側板」「背板」ごとに、`クリア塗装（材質の木目）` / `ウォルナット調` /
`ホワイト` / `ブラック` のフィニッシュを個別に指定できる（フォーム送信時に
`panelFinishes: {"天板": "walnut", ...}` としてAPIへ渡す）。実際にFreeCAD＋POV-Rayで
レンダリングし、パーツごとに見た目が明確に異なることを確認済み。

- **FreeCAD側（`generate_model.py`）**: ヘッドレス実行（`freecadcmd`）では従来の
  `obj.ViewObject.ShapeColor`が使えない（`ViewObject`が`None`になる）ことが判明したため、
  FreeCAD 1.1.x系の新しいマテリアル機構`obj.ShapeMaterial`
  （`setAppearanceValue("DiffuseColor", ...)`）を使ってパーツごとの色を`.FCStd`に反映している
  （`_apply_panel_color()`）。将来のFreeCADバージョンでAPIが変わった場合に備えて
  try/exceptで包んであり、失敗してもレンダリング自体は継続する。
- **POV-Ray側（`generate_model.py`の`_panel_pov_texture()`）**: 単色`pigment{}`ではなく、
  POV-Ray同梱の`woods.inc`が提供する多層の木目テクスチャマクロ（`T_Wood1`〜`T_Wood35`）を
  材質ごとに割り当てている（例: パイン集成材→`T_Wood10`、ラワン合板→`T_Wood15`）。
  「ウォルナット調」フィニッシュは下地の材質に関わらず`T_Wood12`（"Walnut-stained pine"
  という同梱コメント通りの色味）を固定で使う。木目パターンの原点はパーツごとの3D中心座標へ
  `translate`しており、組み立て位置に関わらず各パーツで木目が正しく見えるようにしている。
  「ホワイト」「ブラック」は塗装が木目を覆い隠す想定のため、`woods.inc`を使わず単色
  `pigment{}`＋`finish{}`（艶や反射をパーツごとに調整）のみで表現する。
- **UI（`static/index.html`）**: 材質選択の下に「パーツごとの塗装（任意）」として4つの
  `<select>`を配置。未選択時はすべて`clear`（材質そのものの木目）扱いになる。
- **インタラクティブ3Dビュー（`serialize_panels_for_viewer()`）**: Three.jsは単色
  フラットシェーディングのため木目までは再現できないが、パーツごとのフィニッシュに応じた
  近似色（`FINISH_HEX`）を反映し、完成イメージとの見た目の整合性を保っている。

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

### 5. インタラクティブ3Dビュー

完成イメージ（FreeCAD＋POV-Rayの静止画）に加えて、ブラウザ内で自由に回転・ズームできる
3Dビューも用意している。「3Dビューで動かす」タブに切り替えると、APIレスポンスに含まれる
パネルの位置・サイズデータ（`compute_panels()`と同じ数値ソース）から、Three.jsで
直方体を組み立てて表示する（ドラッグ回転・スクロールズーム・右ドラッグ平行移動に対応）。
Three.js本体はCDN（unpkg）から読み込むため、インターネット接続が必要。

### 6. TANE:iチャットとの双方向同期

TANE:iチャット（`app/app/page.tsx`、Vercel等にデプロイされるメインシステム）とStudioの間で、
確定仕様を自動反映しあう機能を用意している。

```
[チャットタブ]                          [Studioタブ]
   pushSpecToStudio(spec) --送信-->  /ws/sync（Flask, flask-sock）  <--送信-- フォーム送信(保存)
   connectStudioSync(cb)  <--受信--                                --broadcast-->
```

- **チャット→Studio**: チャットでAIが設計提案を出すと、回答末尾に非表示の
  `tanei-studio-spec`ブロック（品名・幅・奥行き・高さ・板厚・材質・パーツごとの塗装）が
  付加される（`app/lib/systemPrompt.ts`）。ユーザーが「🪚 Studioで確認」ボタン
  （`CompletionCards.tsx`）を押すと、`app/lib/studioSync.ts`の`pushSpecToStudio()`が
  `/ws/sync`へWebSocketで送信し、Studio側（`static/index.html`）がフォームへ自動反映＋
  自動レンダリングする。
- **Studio→チャット**: Studio側でオペレーターが寸法・塗装を微調整して「FreeCADで
  レンダリング」を押す（＝保存が確定する）たびに、`/api/render`成功時に
  サーバー側（`server.py`の`broadcast_spec_update()`）が最新仕様を`/ws/sync`の
  全クライアントへブロードキャストする。チャット側は`connectStudioSync()`でこれを
  受け取り、トースト通知で最新仕様をユーザーに知らせる。
- **なぜWebSocketか**: Studioは`freecadcmd`/`povray`というローカルバイナリに依存するため、
  Vercel等にデプロイされたチャットのサーバー側から直接アクセスすることはできない。
  そのため同期はオペレーターのブラウザ内JavaScriptが、同じPC上で起動している
  `localhost:5001`のStudioへ直結する形で行う（サーバー間連携ではなく、ブラウザが
  両者の橋渡し役になる）。`postMessage`はウィンドウ参照が生きている間しか使えず、
  `localStorage`/`BroadcastChannel`はオリジンをまたげない（チャットのドメインと
  `localhost:5001`は別オリジン）ため、オリジンをまたいで安定して使えるWebSocketを選んだ。
- Studio未起動時に「Studioで確認」を押した場合は、WebSocket接続がタイムアウトし、
  クエリパラメータ（`item`/`width`/`depth`/`height`/`thickness`/`material`/`panelFinishes`/
  `autoRender=1`）付きで`http://localhost:5001/`を新規タブで開くフォールバックになる。
- 既知の制約: `latest_spec`はFlaskプロセス内メモリのみで、複数案件の同時進行には
  `sessionId`単位への拡張が必要（現状は単一セッション運用前提）。また`server.py`は
  `host="0.0.0.0"`でLAN全体に公開されているため、同期チャネル追加後は同一Wi-Fi上の
  他端末からも任意の仕様を送り込める状態になる。社内利用に限定するなら`127.0.0.1`に
  絞るか、`/ws/sync`接続時の認証を追加することを推奨する。

## 追加パーツ（オプションパーツ）

基本の箱（天板・底板・側板・背板）に加えて、右側パネルの約10種類のチェックボックスから
追加パーツを組み合わせられる: **扉・引き出し前板・脚・幕板・支柱・本体2段重ね・縦仕切り・
横棚板・背面補強桟・キャスター台座**。それぞれ有効/無効の切り替えと、枚数・本数・高さなど
簡単なパラメータを持つ。

### アーキテクチャ（なぜ木取り表・3Dビューア・レンダリングが自動で連動するか）

`generate_model.py`のパネルは、追加パーツも含めて全て同じ形の辞書
（`label`/`material`/`finish`/`size`/`pos`/`cut_w`/`cut_d`/`cut_t`）で表現される
（`compute_option_panels()`が扉・脚などのパーツ生成関数をディスパッチし、この形で返す）。
呼び出し側は `panels = compute_panels(...) + compute_option_panels(...)` と連結するだけでよく、
以下はすべて「パネルのリスト」を受け取る既存の関数のままで、追加パーツ専用のコードが一切不要:

- `build_freecad_document()` — FreeCAD上にBox形状として組み立てる
- `write_cutlist_csv()` — 木取り表CSV（品名・幅・奥行・厚み・材質・枚数）。同一規格の
  パーツは自動的に枚数が集約されるため、例えば「本体2段重ね」は天板・底板等の枚数が
  単純に+1されるだけで、追加のラベルは増えない
- `generate_pov_scene()` — POV-Rayのbox{}プリミティブとテクスチャ
- `serialize_panels_for_viewer()` / Three.jsの3Dビューア — 追加パーツも同じ色ロジックで着色される
- `mock_preview.py`の等角プレビューSVG（FreeCAD/POV-Ray未接続時のフォールバック）

「印刷用のカット依頼用紙」（結果パネルの「🖨 カット依頼用紙を印刷」ボタン、`static/index.html`の
`#print-sheet`、`@media print`スタイル）も、画面上の木取り表と全く同じ`data.cutlist`から
組み立てているため、追加パーツを有効にするだけで自動的にカット依頼用紙にも反映される。

### 追加した際に発生した副作用の修正

脚（本体下面より下）・扉（本体前面より手前）・本体2段重ね（本体の上）などは、基本の
外形寸法（width/depth/height）の範囲をはみ出す。POV-Rayシーンのカメラ・地面は元々
生の外形寸法を基準に配置していたため、脚が地面（`plane`）を突き抜けて見えたり、
はみ出た部分が画角外になったりする不具合があった。`generate_pov_scene()`に
`_panels_bounding_box()`を追加し、追加パーツ込みの全パネルの外接直方体を実際に計算して
カメラ・地面・ライトの位置をそこから求めるように修正した（3Dビューア・簡易プレビューは
元々個々のパネルから動的にバウンディングボックスを計算していたため、この問題は無かった）。

### 各パーツの座標の考え方（角材・台座は「長さ×断面×断面」で記録）

天板・底板・側板・背板・扉・縦仕切り・横棚板などのフラットパネルは、既存の慣習通り
`cut_w`/`cut_d`が面の縦横、`cut_t`が厚みを表す。一方、脚・支柱・キャスター台座のような
角材・ブロック状のパーツは「幅×奥行き×厚み」という表現がなじまないため、
`cut_w`=長さ、`cut_d`/`cut_t`=断面の一辺（mm）として木取り表に記録している
（列名自体は共通のCSVスキーマを流用しているだけで、値の意味がパーツの形状によって異なる点に注意）。

## 既知の制約・今後の検討事項
- POV-Rayのレンダリングは同期処理でFlaskのリクエストをブロックする（プロトタイプの
  ため）。実運用ではジョブキュー化（Celery等）とポーリング/WebSocketでの進捗通知が必要。
- POV-Rayの完成イメージは`woods.inc`の木目テクスチャで質感を大幅に改善したが、
  マクロは既存の5材質（パイン集成材／シナベニヤ／ラワン合板／SPF材／OSB合板）＋
  ウォルナット調フィニッシュに対する固定の割り当てであり、任意の材質名や
  実写真ベースのテクスチャには対応していない。
- 木取りCSVは `freecad-integration/`（Phase1の木取り最適化プロトタイプ）が読み込める
  スキーマ（品名,幅,奥行,厚み,材質,枚数）に合わせてあるため、複数家具分の部材リストを
  まとめて最適化したい場合はそちらに渡すことができる。
- インタラクティブ3Dビューは単色フラットシェーディングの直方体表示で、パーツごとの
  フィニッシュ色は反映されるが、POV-Ray側の影・アンチエイリアス・木目調の質感などは
  反映していない（あくまで形状・配色確認用）。
