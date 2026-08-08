"""
TANE:i FreeCAD Studio — 独立したFreeCAD中心の設計・レンダリングシステム（Phase 1: 最小プロトタイプ）。

既存のTANE:iメインシステム（Next.js / Gemini）には一切依存しない、単体のFlaskサーバー。
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

app = Flask(__name__, static_folder=None)
sock = Sock(app)

os.makedirs(RENDERS_DIR, exist_ok=True)

# --- チャット(Next.js)⇔Studio 双方向同期用の WebSocket ハブ ---
# Studioはfreecadcmd/povrayというローカルバイナリに依存するため、Vercel等にデプロイした
# チャットのサーバー側から直接叩くことはできない。そのため同期はオペレーターのブラウザが
# 「チャットのタブ」「Studioのタブ」の両方からこの/ws/syncに直結する形で成立させる
# （ブラウザ⇔ブラウザではなく、両方がこのFlaskサーバーの同一エンドポイントに接続することで
# 中継する）。sync_clientsは接続中の全クライアント（チャット側・Studio側の両方を含む）、
# latest_specは直近の確定仕様で、新規接続時に最新状態を送るためだけに使う簡易プロトタイプ実装
# （プロセス再起動で消える。複数案件の同時進行にはsessionId単位への拡張が必要）。
sync_clients = set()
latest_spec = {}


def broadcast_spec_update(payload, source, exclude=None):
    """接続中の全クライアント（excludeを除く）へ、最新仕様をブロードキャストする。"""
    latest_spec.update(payload)
    message = json.dumps({"type": "spec-update", "source": source, "payload": payload})
    for client in list(sync_clients):
        if client is exclude:
            continue
        try:
            client.send(message)
        except Exception:
            sync_clients.discard(client)


@sock.route("/ws/sync")
def ws_sync(ws):
    sync_clients.add(ws)
    try:
        if latest_spec:
            ws.send(json.dumps({"type": "spec-update", "source": "studio", "payload": latest_spec}))
        while True:
            raw = ws.receive()
            if raw is None:
                break
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("type") == "spec-update" and isinstance(msg.get("payload"), dict):
                # チャット側から送られてきた確定仕様を、Studio側（他の全クライアント）へ中継する
                broadcast_spec_update(msg["payload"], msg.get("source", "chat"), exclude=ws)
    finally:
        sync_clients.discard(ws)


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


@app.route("/renders/<job_id>/<path:filename>")
def render_files(job_id, filename):
    job_dir = os.path.join(RENDERS_DIR, job_id)
    return send_from_directory(job_dir, filename)


def run_freecad_pipeline(job_dir, item, width, depth, height, thickness, material, panel_finishes, options):
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


def run_mock_pipeline(job_dir, item, width, depth, height, thickness, material, panel_finishes, options):
    """FreeCAD/POV-Ray未接続時のフォールバック: 実際の寸法計算＋等角プレビューSVGで代替する。

    開発環境（FreeCAD/POV-Ray未インストール）でも、UI・APIの一連の流れを実際に動かして
    確認できるようにするためのモード。本番のフォトリアルなレンダリングの代わりにはならない。
    """
    panels = compute_panels(width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes)
    panels += compute_option_panels(
        width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes, options
    )

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

    item = str(data.get("item") or "家具").strip()
    width = float(data["width"])
    depth = float(data["depth"])
    height = float(data["height"])
    thickness = float(data.get("thickness") or DEFAULT_THICKNESS_MM)
    material = str(data["material"]).strip()
    panel_finishes = parse_panel_finishes(data)
    options = parse_options(data)

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(RENDERS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    try:
        # インタラクティブ3Dビューア（Three.js）用のパネルジオメトリは、どちらのパイプラインでも
        # 同じcompute_panels()+compute_option_panels()から得られるため、ここで一度だけ計算して
        # 両方に使い回す（扉・脚・棚板などの追加パーツも同じ形のパネル辞書で返るため連結するだけでよい）
        panels = compute_panels(width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes)
        panels += compute_option_panels(
            width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes, options
        )
        panels_for_viewer = serialize_panels_for_viewer(panels)

        if shutil.which(FREECAD_CMD_PATH):
            payload, error_payload, status = run_freecad_pipeline(
                job_dir, item, width, depth, height, thickness, material, panel_finishes, options
            )
        else:
            payload, error_payload, status = run_mock_pipeline(
                job_dir, item, width, depth, height, thickness, material, panel_finishes, options
            )
    except ValueError as exc:
        # compute_panels()の寸法バリデーション（高さが板厚に対して小さすぎる等）
        return jsonify({"error": str(exc)}), 400

    if error_payload:
        return jsonify(error_payload), status

    # Studio側でレンダリングが確定した(=フォーム送信された)タイミングで、
    # チャット側に接続中のWebSocketクライアントへ最新仕様をブロードキャストする
    # (双方向同期の「Studio→チャット」方向。要件の「保存時に必ず反映」に対応)
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
        },
        source="studio",
    )

    return jsonify({
        "jobId": job_id,
        "item": payload["item"],
        "imageUrl": f"/renders/{job_id}/{payload['imageFilename']}",
        "cutlist": payload["cutlist"],
        "mockMode": payload["mockMode"],
        "panels": panels_for_viewer,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
