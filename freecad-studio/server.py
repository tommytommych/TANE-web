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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RENDERS_DIR = os.path.join(BASE_DIR, "renders")
STATIC_DIR = os.path.join(BASE_DIR, "static")
GENERATE_SCRIPT = os.path.join(BASE_DIR, "freecad_scripts", "generate_model.py")

sys.path.insert(0, BASE_DIR)
from freecad_scripts.generate_model import (  # noqa: E402
    DEFAULT_BACK_THICKNESS_MM,
    compute_panels,
    write_cutlist_csv,
)
from mock_preview import render_iso_preview_svg  # noqa: E402

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


def run_freecad_pipeline(job_dir, item, width, depth, height, thickness, material):
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


def run_mock_pipeline(job_dir, item, width, depth, height, thickness, material):
    """FreeCAD/POV-Ray未接続時のフォールバック: 実際の寸法計算＋等角プレビューSVGで代替する。

    開発環境（FreeCAD/POV-Ray未インストール）でも、UI・APIの一連の流れを実際に動かして
    確認できるようにするためのモード。本番のフォトリアルなレンダリングの代わりにはならない。
    """
    panels = compute_panels(width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material)

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

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(RENDERS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    try:
        if shutil.which(FREECAD_CMD_PATH):
            payload, error_payload, status = run_freecad_pipeline(
                job_dir, item, width, depth, height, thickness, material
            )
        else:
            payload, error_payload, status = run_mock_pipeline(
                job_dir, item, width, depth, height, thickness, material
            )
    except ValueError as exc:
        # compute_panels()の寸法バリデーション（高さが板厚に対して小さすぎる等）
        return jsonify({"error": str(exc)}), 400

    if error_payload:
        return jsonify(error_payload), status

    return jsonify({
        "jobId": job_id,
        "item": payload["item"],
        "imageUrl": f"/renders/{job_id}/{payload['imageFilename']}",
        "cutlist": payload["cutlist"],
        "mockMode": payload["mockMode"],
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
