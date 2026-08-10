# TANE:i 設計スタジオ（FreeCAD + POV-Ray）をクラウド上で常時稼働させるためのコンテナ定義。
# Render等のDocker対応PaaSに、このディレクトリ（tanei-studio/）をルートとしてデプロイする想定。
# 詳しい手順はDEPLOY.mdを参照。
#
# 注意: FreeCAD一式が入るため、イメージサイズは1GB超になる（apt-getのfreecadパッケージが
# 依存するQt関連ライブラリが大きいため）。ビルドにも数分かかる。

FROM python:3.11-slim-bookworm

# freecad   : freecadcmd（本体の3D生成に使用）
# povray    : POV-Rayレイトレーサー（完成イメージのレンダリングに使用）
# fonts-noto-cjk : レンダリング・PDF内の日本語文字化け防止
RUN apt-get update && apt-get install -y --no-install-recommends \
        freecad \
        povray \
        fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# apt版freecad/povrayはどちらもPATHへインストールされるため、コマンド名だけで解決できる
# （generate_model.py / server.pyのデフォルト値と一致させている。別の場所に入る環境では
# Render側の環境変数でFREECAD_CMD_PATH・POVRAY_PATHを上書きできる）
ENV FREECAD_CMD_PATH=freecadcmd \
    POVRAY_PATH=povray \
    PYTHONUNBUFFERED=1 \
    FLASK_DEBUG=0

# PORTはRender等が起動時に動的に注入する環境変数（既定8000はローカルでdocker runする際の値）
ENV PORT=8000
EXPOSE 8000

# flask-sockのWebSocketを本番運用するため、Flask附属の開発サーバーではなくgunicornを使う。
# 1ワーカー・多スレッド構成が公式に推奨されている（各WebSocket接続がスレッドを1つ占有するため、
# ワーカー数を増やすより1ワーカーの中でスレッド数を増やす方が接続を安定して捌ける）。
# --timeoutはFreeCADレンダリング（最大180秒程度）がgunicornにworker timeoutとして
# 強制終了されないよう、余裕を持たせて220秒にしている
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 50 --timeout 220 server:app"]
