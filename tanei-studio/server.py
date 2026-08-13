"""
TANE:i 設計スタジオ — FreeCAD中心の設計・レンダリングシステム。

`freecad-studio/`（独立プロトタイプ）を複製し、TANE:iチャット（Next.js / Gemini、
app/app/studio/）に組み込んで使うための版。プロトタイプ側は不具合対応時の切り戻し用に
そのまま残し、こちらを実際にTANE:iから参照する「本番」の実体として扱う。
FreeCAD/POV-Rayというローカルバイナリに依存する都合上、単体のFlaskサーバーとして
動かす点はプロトタイプ版と変わらない（TANE:i側はapp/app/studio/でこのサーバーを
iframe埋め込みし、WebSocket同期でチャットの内容を自動反映する）。

ユーザーの入力（幅・奥行・高さ・材質）を受け取り、freecad_scripts/generate_model.py を
freecadcmd経由でサブプロセス実行し、FreeCADベースの完成イメージ（PNG）と木取りリストを返す。

起動方法:
    pip install -r requirements.txt
    python3 server.py

前提ソフトウェア（このリポジトリには含まれない、別途インストールが必要）:
    - FreeCAD（freecadcmd / FreeCADCmd が実行できること）
    - POV-Ray（povray コマンドが実行できること）
    詳細は README.md を参照。
"""

import json
import os
import re
import shutil
import subprocess
import sys
import uuid

from flask import Flask, jsonify, request, send_from_directory
from flask_sock import Sock

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RENDERS_DIR = os.path.join(BASE_DIR, "renders")
STATIC_DIR = os.path.join(BASE_DIR, "static")
GENERATE_SCRIPT = os.path.join(BASE_DIR, "freecad_scripts", "generate_model.py")

sys.path.insert(0, BASE_DIR)
from freecad_scripts.generate_model import (  # noqa: E402
    ALL_FINISHABLE_LABELS,
    DEFAULT_BACK_THICKNESS_MM,
    FINISH_OPTIONS,
    FOUNDATION_PART_DEFS,
    TIER_PART_DEFS,
    compute_option_panels,
    compute_panels,
    compute_table_panels,
    write_cutlist_csv,
)
from mock_preview import (  # noqa: E402
    render_iso_preview_svg,
    MATERIAL_HEX,
    DEFAULT_MATERIAL_HEX,
    FINISH_HEX,
    WHEEL_FINISH_HEX,
)

FREECAD_CMD_PATH = os.environ.get("FREECAD_CMD_PATH", "freecadcmd")

MIN_DIMENSION_MM = 100
MAX_DIMENSION_MM = 3000
DEFAULT_THICKNESS_MM = 18

# セッションID・ジョブIDはファイルパスや辞書キーにそのまま使うため、英数字・ハイフン・
# アンダースコアのみに厳しく制限する（URLに直接渡ってくる値なので、`../`等による
# パストラバーサルを確実に防ぐ）
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def resolve_session_id(raw):
    """クライアントから受け取ったsessionIdを検証する。妥当な形式でなければNoneを返す
    （呼び出し側でuuid4によるランダム生成にフォールバックする）。"""
    if isinstance(raw, str) and SESSION_ID_RE.match(raw):
        return raw
    return None


def resolve_job_id(raw):
    """/renders/<session_id>/<job_id>/...のURLから渡されるjob_idを検証する。"""
    if isinstance(raw, str) and JOB_ID_RE.match(raw):
        return raw
    return None

app = Flask(__name__, static_folder=None)
sock = Sock(app)

os.makedirs(RENDERS_DIR, exist_ok=True)

# --- チャット(Next.js)⇔Studio 双方向同期用の WebSocket ハブ（セッションID単位で分離） ---
# Studioはfreecadcmd/povrayというローカルバイナリに依存するため、Vercel等にデプロイした
# チャットのサーバー側から直接叩くことはできない。そのため同期はオペレーターのブラウザが
# 「チャットのタブ」「Studioのタブ」の両方からこの/ws/syncに直結する形で成立させる
# （ブラウザ⇔ブラウザではなく、両方がこのFlaskサーバーの同一エンドポイントに接続することで
# 中継する）。
#
# 【セッション分離】この状態がプロセス全体でグローバル1つしかないと、例えば同じ端末で
# チャットのタブを2つ開いて別々の相談をした場合などに、片方の設計中にもう片方が何か
# 送信・レンダリングした瞬間に、互いの画面に相手の仕様が割り込んで表示されてしまう
# （設計内容が混ざる）。これを防ぐため、sessionId（チャット側のapp/lib/studioSession.tsが
# ブラウザのタブごとに発行するUUID。/ws/syncへは`?sessionId=...`クエリで、/api/renderへは
# JSONボディのsessionIdフィールドで渡ってくる）ごとにclients/spec/sourceを独立した
# dictへ分離して管理する。
# sessionsは{session_id: {"clients": set(), "spec": {}, "source": "chat"}}で、
# 該当セッションの接続が0になった時点でエントリごと破棄する（プロセスのメモリに
# 使われなくなったセッションが溜まり続けないようにするための単純なガベージコレクション）。
sessions = {}


def get_session_state(session_id):
    return sessions.setdefault(session_id, {"clients": set(), "spec": {}, "source": "chat"})


def broadcast_spec_update(payload, source, session_id, exclude=None):
    """同じセッションに接続中の全クライアント（excludeを除く）へ、最新仕様をブロードキャストする。
    他のセッションのクライアントには一切送られない（セッション間の分離の要）。"""
    state = get_session_state(session_id)
    state["spec"].update(payload)
    state["source"] = source
    message = json.dumps({"type": "spec-update", "source": source, "payload": payload})
    for client in list(state["clients"]):
        if client is exclude:
            continue
        try:
            client.send(message)
        except Exception:
            state["clients"].discard(client)


@sock.route("/ws/sync")
def ws_sync(ws):
    # 【重要・実機検証で判明】新規接続時の再送で送信元を"studio"に決め打ちしていたところ、
    # 「チャットでpushしてから/app/studioへ画面遷移する」フロー（送信時点ではまだ誰も
    # 接続していない）で、遷移後に新規接続したiframe側が「これはstudio発の通知だ」と
    # 誤認識し、自動反映はしても自動レンダリングが発火しない不具合があった
    # （static/index.html側はsource==='chat'の場合のみ自動レンダリングする）。
    # 直近の送信元をセッションごとに覚えておき、新規接続時の再送でもそれをそのまま使うことで解決した。
    session_id = resolve_session_id(request.args.get("sessionId")) or uuid.uuid4().hex
    state = get_session_state(session_id)
    state["clients"].add(ws)
    try:
        if state["spec"]:
            ws.send(json.dumps({"type": "spec-update", "source": state["source"], "payload": state["spec"]}))
        while True:
            raw = ws.receive()
            if raw is None:
                break
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("type") == "spec-update" and isinstance(msg.get("payload"), dict):
                # チャット側から送られてきた確定仕様を、同じセッションの他クライアントへ中継する
                broadcast_spec_update(msg["payload"], msg.get("source", "chat"), session_id, exclude=ws)
    finally:
        state["clients"].discard(ws)
        if not state["clients"]:
            sessions.pop(session_id, None)


def serialize_panels_for_viewer(panels):
    """ブラウザ側のThree.jsインタラクティブ3Dビューア用に、panelsをJSON化しやすい形にする。
    パネルごとのfinish（クリア塗装/ウォルナット調/ホワイト/ブラック）を色に反映する。
    キャスター（"shape": "wheel"）は木目ではなくゴム/樹脂の色になり、形状情報も渡す。
    """
    def color_for(panel):
        finish = panel.get("finish", "clear")
        if panel.get("shape") == "wheel":
            return WHEEL_FINISH_HEX.get(finish, WHEEL_FINISH_HEX["clear"])
        if finish in FINISH_HEX:
            return FINISH_HEX[finish]
        return MATERIAL_HEX.get(panel["material"], DEFAULT_MATERIAL_HEX)

    return [
        {
            "label": p["label"],
            "x": p["pos"][0], "y": p["pos"][1], "z": p["pos"][2],
            "dx": p["size"][0], "dy": p["size"][1], "dz": p["size"][2],
            "color": color_for(p),
            "shape": p.get("shape", "box"),
        }
        for p in panels
    ]


def parse_panel_finishes(data):
    """リクエストのpanelFinishesを検証し、未知のキー・不正な値を除いた辞書にする。

    天板・底板・側板・背板の基本4種だけでなく、脚・扉・キャスターなど追加パーツの
    品名も含めたALL_FINISHABLE_LABELS（generate_model.py）を対象にする。
    """
    raw = data.get("panelFinishes")
    if not isinstance(raw, dict):
        return {}
    return {
        str(label): str(finish)
        for label, finish in raw.items()
        if str(label) in ALL_FINISHABLE_LABELS and str(finish) in FINISH_OPTIONS
    }


def parse_options(data):
    """リクエストのoptions（扉・脚・棚板などの追加パーツ）を検証する。

    generate_model.py側のFOUNDATION_PART_DEFS/TIER_PART_DEFSに無いキー、
    範囲外のパラメータ・個数は黙って除外・クランプする（generate_model.py側の
    _resolve_foundation_params／compute_option_panelsのクランプと同じ考え方だが、
    こちらはAPIの入力境界での防御用）。
    """
    raw = data.get("options")
    if not isinstance(raw, dict):
        return {}

    result = {}

    # 土台パーツ（脚・幕板・キャスター台座）: 常に本体最下部にのみ取り付く
    for key, opt_def in FOUNDATION_PART_DEFS.items():
        opt = raw.get(key)
        if not isinstance(opt, dict) or not opt.get("enabled"):
            continue
        parsed = {"enabled": True}
        for param_key, meta in opt_def["params"].items():
            try:
                value = float(opt.get(param_key, meta["default"]))
            except (TypeError, ValueError):
                value = meta["default"]
            parsed[param_key] = max(meta["min"], min(meta["max"], value))
        result[key] = parsed

    # 本体2段重ね（enabledのみのシンプルなトグル）
    stack_opt = raw.get("stack")
    if isinstance(stack_opt, dict) and stack_opt.get("enabled"):
        result["stack"] = {"enabled": True}

    # 段に取り付けるパーツ（扉・引き出し前板・支柱・縦仕切り・横棚板・背面補強桟）:
    # tier1/tier2それぞれの個数を検証・クランプする
    for key, part_def in TIER_PART_DEFS.items():
        tier_opt = raw.get(key)
        if not isinstance(tier_opt, dict):
            continue
        parsed = {}
        for tier_key in ("tier1", "tier2"):
            try:
                count = int(tier_opt.get(tier_key, 0))
            except (TypeError, ValueError):
                count = 0
            parsed[tier_key] = max(0, min(part_def["max_per_tier"], count))
        if parsed["tier1"] or parsed["tier2"]:
            result[key] = parsed

    return result


def resolve_kind(data):
    """kind未指定・不正値は既存仕様どおり'box'として扱う（後方互換。TANE:iブラウザCAD側の
    FurnitureDesign.kindと同じ考え方）。"""
    value = data.get("kind")
    return value if value in ("box", "table") else "box"


def compute_panels_for_kind(kind, width, depth, height, thickness, material, panel_finishes, options):
    """kindに応じてパネル構成を計算する（api_render・run_mock_pipelineで共通利用し、
    2箇所で分岐ロジックが食い違わないようにする）。"""
    if kind == "table":
        # テーブルは箱本体を持たないため、天板+脚+幕板のみで構成する
        # （既存のcompute_option_panelsによる脚・幕板追加は箱本体前提のため使わない）
        return compute_table_panels(width, depth, height, thickness, material, panel_finishes)
    panels = compute_panels(width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes)
    panels += compute_option_panels(
        width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes, options
    )
    return panels


def validate_input(data):
    """入力値を検証し、問題があればエラーメッセージの文字列を返す（問題なければNone）。"""
    if not isinstance(data, dict):
        return "リクエストボディがJSONオブジェクトではありません。"

    for field in ("width", "depth", "height"):
        value = data.get(field)
        if not isinstance(value, (int, float)):
            return f"「{field}」は数値で指定してください。"
        if not (MIN_DIMENSION_MM <= value <= MAX_DIMENSION_MM):
            return f"「{field}」は{MIN_DIMENSION_MM}〜{MAX_DIMENSION_MM}mmの範囲で指定してください。"

    material = data.get("material")
    if not isinstance(material, str) or not material.strip():
        return "「material」（材質）を指定してください。"

    return None


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.route("/renders/<session_id>/<job_id>/<path:filename>")
def render_files(session_id, job_id, filename):
    # session_id/job_idはURLから直接渡ってくるため、os.path.joinでパスを組み立てる前に
    # 必ず英数字・ハイフン・アンダースコアのみであることを検証する（`../`によるパス
    # トラバーサル対策。send_from_directoryはfilename側の脱出は防ぐが、job_dir自体が
    # 不正な場所を指してしまうと意味がないため、ここで別途検証する）
    session_id = resolve_session_id(session_id)
    job_id = resolve_job_id(job_id)
    if session_id is None or job_id is None:
        return jsonify({"error": "不正なセッションID・ジョブIDです。"}), 400
    job_dir = os.path.join(RENDERS_DIR, session_id, job_id)
    return send_from_directory(job_dir, filename)


def run_freecad_pipeline(job_dir, item, width, depth, height, thickness, material, panel_finishes, options, kind):
    """本来のパイプライン: freecadcmdをサブプロセス実行し、FreeCAD+POV-Rayで生成する。

    freecadcmdは独自のCLIパーサー（boost::program_options）を持ち、一般的な
    `script.py -- --foo bar` のような「--以降はスクリプトへそのまま渡す」慣習を尊重しない
    （実際に検証したところ、出力先ディレクトリのパスをFreeCADが開くべきドキュメントと
    誤認識し「File format not supported」エラーになった）。そのため、パラメータは
    コマンドライン引数ではなく環境変数 TANEI_PARAMS_JSON で渡す。
    """
    params_json = json.dumps({
        "item": item,
        "width": width,
        "depth": depth,
        "height": height,
        "thickness": thickness,
        "material": material,
        "panelFinishes": panel_finishes,
        "options": options,
        "kind": kind,
        "outputDir": job_dir,
    })
    cmd = [FREECAD_CMD_PATH, GENERATE_SCRIPT]
    env = {**os.environ, "TANEI_PARAMS_JSON": params_json}

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, env=env)
    except subprocess.TimeoutExpired:
        return None, {"error": "FreeCADでの生成処理がタイムアウトしました（180秒）。"}, 504

    # 結果はstdoutではなく result.json ファイルから読む（generate_model.py側のコメント参照:
    # freecadcmd経由ではprint()の出力がサブプロセスキャプチャに確実に反映されないケースがある）
    result_json_path = os.path.join(job_dir, "result.json")
    if not os.path.exists(result_json_path):
        return None, {
            "error": "FreeCADでのモデル生成に失敗しました（result.jsonが生成されませんでした）。",
            "details": (result.stderr or result.stdout)[-2000:],
        }, 500

    with open(result_json_path, encoding="utf-8") as f:
        payload = json.load(f)

    if not payload.get("ok"):
        return None, {"error": payload.get("error", "不明なエラーが発生しました。")}, 500

    cutlist = []
    cutlist_csv_path = payload.get("cutlistCsv")
    if cutlist_csv_path and os.path.exists(cutlist_csv_path):
        import csv
        with open(cutlist_csv_path, newline="", encoding="utf-8") as f:
            cutlist = list(csv.DictReader(f))

    return {
        "item": payload.get("item", item),
        "imageFilename": "render.png",
        "cutlist": cutlist,
        "mockMode": False,
    }, None, None


def run_mock_pipeline(job_dir, item, width, depth, height, thickness, material, panel_finishes, options, kind):
    """FreeCAD/POV-Ray未接続時のフォールバック: 実際の寸法計算＋等角プレビューSVGで代替する。

    開発環境（FreeCAD/POV-Ray未インストール）でも、UI・APIの一連の流れを実際に動かして
    確認できるようにするためのモード。本番のフォトリアルなレンダリングの代わりにはならない。
    """
    panels = compute_panels_for_kind(kind, width, depth, height, thickness, material, panel_finishes, options)

    cutlist_csv_path = os.path.join(job_dir, "cutlist.csv")
    write_cutlist_csv(panels, cutlist_csv_path)

    svg = render_iso_preview_svg(panels, item, material)
    svg_path = os.path.join(job_dir, "preview.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg)

    import csv
    with open(cutlist_csv_path, newline="", encoding="utf-8") as f:
        cutlist = list(csv.DictReader(f))

    return {
        "item": item,
        "imageFilename": "preview.svg",
        "cutlist": cutlist,
        "mockMode": True,
    }, None, None


@app.route("/api/render", methods=["POST"])
def api_render():
    data = request.get_json(silent=True) or {}

    error = validate_input(data)
    if error:
        return jsonify({"error": error}), 400

    # チャット・設計スタジオ側（app/lib/studioSession.ts / static/index.html）が
    # ブラウザのタブ単位で発行したUUIDを受け取る。不正・未指定の場合はランダムなIDに
    # フォールバックする（この場合はどのセッションのWebSocketにも属さないため、
    # チャットとの自動同期は効かないが、レンダリング自体は独立して問題なく動作する）
    session_id = resolve_session_id(data.get("sessionId")) or uuid.uuid4().hex

    item = str(data.get("item") or "家具").strip()
    width = float(data["width"])
    depth = float(data["depth"])
    height = float(data["height"])
    thickness = float(data.get("thickness") or DEFAULT_THICKNESS_MM)
    material = str(data["material"]).strip()
    panel_finishes = parse_panel_finishes(data)
    options = parse_options(data)
    kind = resolve_kind(data)

    # renders/配下をセッションIDごとのディレクトリに分けることで、他セッションの
    # ジョブと物理的に混ざらないようにする（job_id自体もuuid4なので元々衝突しないが、
    # セッション単位でまとめておくと、そのセッションの成果物一式を後から特定・削除しやすい）
    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(RENDERS_DIR, session_id, job_id)
    os.makedirs(job_dir, exist_ok=True)

    try:
        # インタラクティブ3Dビューア（Three.js）用のパネルジオメトリは、どちらのパイプラインでも
        # 同じcompute_panels_for_kind()から得られるため、ここで一度だけ計算して
        # 両方に使い回す（扉・脚・棚板などの追加パーツも同じ形のパネル辞書で返るため連結するだけでよい）
        panels = compute_panels_for_kind(kind, width, depth, height, thickness, material, panel_finishes, options)
        panels_for_viewer = serialize_panels_for_viewer(panels)

        if shutil.which(FREECAD_CMD_PATH):
            payload, error_payload, status = run_freecad_pipeline(
                job_dir, item, width, depth, height, thickness, material, panel_finishes, options, kind
            )
        else:
            payload, error_payload, status = run_mock_pipeline(
                job_dir, item, width, depth, height, thickness, material, panel_finishes, options, kind
            )
    except ValueError as exc:
        # compute_panels()の寸法バリデーション（高さが板厚に対して小さすぎる等）
        return jsonify({"error": str(exc)}), 400

    if error_payload:
        return jsonify(error_payload), status

    # Studio側でレンダリングが確定した(=フォーム送信された)タイミングで、
    # 同じセッションでチャット側に接続中のWebSocketクライアントへ最新仕様をブロードキャストする
    # (双方向同期の「Studio→チャット」方向。要件の「保存時に必ず反映」に対応。他セッションには届かない)
    broadcast_spec_update(
        {
            "item": item,
            "width": width,
            "depth": depth,
            "height": height,
            "thickness": thickness,
            "material": material,
            "panelFinishes": panel_finishes,
            "options": options,
            "kind": kind,
        },
        source="studio",
        session_id=session_id,
    )

    return jsonify({
        "jobId": job_id,
        "sessionId": session_id,
        "item": payload["item"],
        "imageUrl": f"/renders/{session_id}/{job_id}/{payload['imageFilename']}",
        "cutlist": payload["cutlist"],
        "mockMode": payload["mockMode"],
        "panels": panels_for_viewer,
    })


if __name__ == "__main__":
    # 設計スタジオはFreeCAD/POV-Rayに依存するため、オペレーターの手元PCで
    # `python3 server.py` を起動して使うPC専用機能（host="0.0.0.0"なので、
    # 同じWi-Fi上の別端末からはPCのIPアドレスでもアクセスできる）
    app.run(host="0.0.0.0", port=5002, debug=True)
