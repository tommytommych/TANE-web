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
import subprocess
import uuid

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RENDERS_DIR = os.path.join(BASE_DIR, "renders")
STATIC_DIR = os.path.join(BASE_DIR, "static")
GENERATE_SCRIPT = os.path.join(BASE_DIR, "freecad_scripts", "generate_model.py")

FREECAD_CMD_PATH = os.environ.get("FREECAD_CMD_PATH", "freecadcmd")

MIN_DIMENSION_MM = 100
MAX_DIMENSION_MM = 3000
DEFAULT_THICKNESS_MM = 18

app = Flask(__name__, static_folder=None)

os.makedirs(RENDERS_DIR, exist_ok=True)


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

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(RENDERS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    cmd = [
        FREECAD_CMD_PATH,
        GENERATE_SCRIPT,
        "--",
        "--item", item,
        "--width", str(width),
        "--depth", str(depth),
        "--height", str(height),
        "--thickness", str(thickness),
        "--material", material,
        "--output-dir", job_dir,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except FileNotFoundError:
        return jsonify({
            "error": (
                f"FreeCADコマンド（'{FREECAD_CMD_PATH}'）が見つかりません。"
                "FreeCADがインストールされているか、FREECAD_CMD_PATH環境変数で"
                "freecadcmdの実行ファイルパスを指定してください。"
            )
        }), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": "FreeCADでの生成処理がタイムアウトしました（180秒）。"}), 504

    result_line = next(
        (line for line in result.stdout.splitlines() if line.startswith("RESULT_JSON:")), None
    )
    error_line = next(
        (line for line in result.stdout.splitlines() if line.startswith("ERROR_JSON:")), None
    )

    if error_line:
        error_payload = json.loads(error_line[len("ERROR_JSON:"):])
        return jsonify({"error": error_payload.get("error", "不明なエラーが発生しました。")}), 500

    if result.returncode != 0 or not result_line:
        return jsonify({
            "error": "FreeCADでのモデル生成に失敗しました。",
            "details": (result.stderr or result.stdout)[-2000:],
        }), 500

    payload = json.loads(result_line[len("RESULT_JSON:"):])

    cutlist = []
    cutlist_csv_path = payload.get("cutlistCsv")
    if cutlist_csv_path and os.path.exists(cutlist_csv_path):
        import csv
        with open(cutlist_csv_path, newline="", encoding="utf-8") as f:
            cutlist = list(csv.DictReader(f))

    return jsonify({
        "jobId": job_id,
        "item": payload.get("item", item),
        "imageUrl": f"/renders/{job_id}/render.png",
        "cutlist": cutlist,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
