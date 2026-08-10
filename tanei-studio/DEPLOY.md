# クラウドへのデプロイ手順（Render推奨）

このディレクトリ（`tanei-studio/`）をクラウド上に常時稼働のWebサービスとしてデプロイし、
オペレーターの手元PCでサーバーを起動しなくても、誰でも（スマートフォン含む）
`https://<デプロイ先のURL>` にアクセスするだけで設計スタジオを使えるようにする手順。

## なぜRenderか

FreeCAD/POV-Rayのレンダリングは1回あたり数十秒〜最大180秒かかる（`server.py`の
`subprocess.run(..., timeout=180)`）。この長さのリクエストを問題なく通せるかが
プラットフォーム選定の決め手になる。

- **Render**: HTTPレスポンスは最大100分まで許容（公式）。DockerfileからそのままWebサービスを
  作れ、HTTPS・WebSocket（wss）も自動で有効になる。今回はこちらを採用する。
- **Fly.io**: 検討したが、30〜60秒程度でリクエストがタイムアウトしたという報告が複数あり、
  今回の用途（1リクエストで最大180秒かかる）には設定の追加検証が必要だったため見送った。
  将来的にコスト最適化のため移行する場合は要検証。

## 前提

- このリポジトリ（`tommytommych/TANE-web`）がGitHubにpush済みであること（既に完了済み）。
- Renderのアカウント（GitHubでサインアップ可）。

## 手順

### 1. Renderで新しいWeb Serviceを作成する

1. https://dashboard.render.com/ にログインし、**New +** → **Web Service** を選ぶ。
2. GitHubリポジトリ `tommytommych/TANE-web` を接続する（初回はRenderにリポジトリへの
   アクセスを許可する画面が出る）。
3. 設定項目:
   - **Name**: 任意（例: `tanei-studio`）。この名前が既定のURL
     `https://<name>.onrender.com` になる。
   - **Root Directory**: `tanei-studio`
     （リポジトリのルートではなく、このサブディレクトリを指定する）
   - **Runtime**: `Docker`（`tanei-studio/Dockerfile`を自動検出する）
   - **Instance Type**: 最低でも **Starter**（1GB RAM以上）を推奨。
     FreeCAD＋POV-Rayはメモリを使うため、無料プラン（512MB）ではメモリ不足で
     レンダリングが失敗する可能性がある。またRenderの無料プランは15分間アクセスがないと
     スリープし、次のアクセス時に再起動で数十秒待たされる（「常時稼働」の要件を満たすには
     有料プランが必要）。
   - **Health Check Path**: `/`（未入力でも既定で動作する）
4. 環境変数は追加不要（`Dockerfile`内で`FREECAD_CMD_PATH=freecadcmd`・
   `POVRAY_PATH=povray`を設定済み。apt版のインストール先と一致する）。
5. **Create Web Service** をクリックしてデプロイを開始する。初回ビルドはFreeCADの
   インストールを含むため、10〜20分程度かかることがある。

### 2. デプロイ結果の確認

1. ビルドが完了したら、割り当てられたURL（例: `https://tanei-studio.onrender.com`）に
   ブラウザでアクセスし、設計スタジオのフォームが表示されることを確認する。
2. 適当な家具プリセットを選んで実際にレンダリングし、完成イメージ（POV-Ray画像）が
   生成されることを確認する（SVGのモック画像しか出ない場合は、FreeCADのインストールに
   問題がある可能性があるので、Renderのログを確認する）。

### 3. Vercel（TANE:i本体）側の設定

Next.jsアプリ（このリポジトリのルート）に、デプロイしたURLを環境変数として設定する。

1. https://vercel.com/ のTANE:iプロジェクト → **Settings** → **Environment Variables**
2. 以下を追加する（Production・Preview両方に設定推奨）:
   ```
   NEXT_PUBLIC_STUDIO_BASE_URL=https://tanei-studio.onrender.com
   ```
   （手順1で実際に割り当てられたURLに置き換える。末尾にスラッシュは付けない）
3. 保存後、**Deployments** タブから最新のデプロイを **Redeploy** する
   （`NEXT_PUBLIC_*`はビルド時にJSへ埋め込まれる値のため、環境変数を追加・変更しただけでは
   反映されず、再ビルドが必要）。

再デプロイが完了すると、TANE:iチャット（`/app`）・設計スタジオ（`/app/studio`）ともに、
パソコン・スマートフォンを問わず、追加設定なしにこのクラウドURLへ自動的に接続される
（`app/lib/studioBaseUrl.ts`が`NEXT_PUBLIC_STUDIO_BASE_URL`を読み取る）。
「パソコン専用機能です」の注意書きや接続設定パネルの自動表示も、この環境変数が
設定されていれば自動的に非表示になる。

## セッション分離（複数人が同時に使っても設計内容は混ざらない）

`server.py`の同期状態（WebSocketクライアント一覧・直近の確定仕様）は、チャット側
（`app/lib/studioSession.ts`）がブラウザのタブ単位で発行するsessionId
（`crypto.randomUUID()`）ごとに分離して管理している。このIDはiframeのURL
（`?sessionId=...`）経由で設計スタジオ側にも渡り、`/ws/sync`のWebSocket接続・
`/api/render`のレンダリングリクエストの両方に必ず含まれる。`renders/`配下の
成果物も`renders/<sessionId>/<jobId>/`に分けているため、Aさんが設計中にBさんが
送信・レンダリングしても、Aさんの画面にBさんの内容が割り込むことはない。

セッションIDが未指定・不正な形式の場合はサーバー側でランダムなIDにフォールバックする
ため、他のセッションと混ざることはないが、その場合はチャットとの自動同期（双方向反映）
は効かない（設計スタジオ単体のレンダリング機能自体は問題なく動作する）。

## デプロイ後にまだ残る制約

- **同時レンダリングの負荷**: 1回のレンダリングはCPUを使い切る処理のため、
  同時に何人もレンダリングするとインスタンスの性能次第で遅延・失敗が増える。
  アクセスが増えてきたらRenderのインスタンスタイプを上げる、またはジョブキュー化を検討する。
- **コスト**: Renderの有料プランは常時稼働のため時間課金される（Starterで概算
  月7ドル前後、執筆時点の目安。最新の料金はRenderの公式サイトで確認すること）。

## ローカル開発への影響

`NEXT_PUBLIC_STUDIO_BASE_URL`を設定していないローカル環境（`.env.local`に追加しない限り）は
これまで通り`http://localhost:5002`にフォールバックし、手元で`python3 server.py`を
起動して開発を続けられる。
