"""
FreeCADのPython環境（freecadcmd）で実行する、家具モデル生成スクリプト。

このスクリプトは通常のpython3ではなく、FreeCAD付属のPythonインタプリタ
（freecadcmd / FreeCADCmd）から実行する前提。`FreeCAD`・`Part`モジュールは
FreeCAD本体にバンドルされており、一般的なpip環境にはインストールできない。

実行例:
    freecadcmd generate_model.py -- \\
        --item "テレビ台" --width 1200 --depth 400 --height 400 \\
        --thickness 18 --material "パイン集成材" --output-dir ./renders/job123

処理の流れ:
  1. 入力パラメータ（幅・奥行・高さ・厚み・材質）から、天板・底板・側板・背板の
     パネル構成（位置・寸法）を計算する。
  2. FreeCADドキュメント上にPart::Featureとして箱形状を組み立て、.FCStdとして保存する
     （将来的な編集・TechDraw図面化・寸法検証などの土台として残す）。
  3. 同じパネル構成から、木取りに使う部材リストCSVを書き出す
     （../../freecad-integration が読み込めるスキーマ: 品名,幅,奥行,厚み,材質,枚数）。
  4. 同じパネル構成から、POV-Ray用のシーンファイル（.pov）をテキストとして生成する。
     FreeCADの形状をメッシュ経由でPOV-Rayに渡す方式は変換が不安定になりやすいため、
     この最小プロトタイプでは「元になったパラメータからネイティブなboxプリミティブを
     直接生成する」方式を採用している（FreeCADモデルとレンダリング結果が常に
     同じ数値ソースから生成されるため、両者がズレることもない）。
  5. povrayコマンドをサブプロセスとして呼び出し、.povから完成イメージPNGを生成する。
  6. 生成物のパスを `RESULT_JSON:` から始まる1行のJSONとして標準出力に書き出す。
     呼び出し元（server.py）はこの行をパースして結果を受け取る。
"""

import argparse
import csv
import json
import os
import subprocess
import sys

DEFAULT_THICKNESS_MM = 18
DEFAULT_BACK_THICKNESS_MM = 5.5


def compute_panels(width_mm, depth_mm, height_mm, thickness_mm, back_thickness_mm, material):
    """家具の外形寸法から、天板・底板・側板×2・背板のパネル構成を計算する。

    各パネルは以下を持つ:
      - size: FreeCAD上でのbox寸法 (dx, dy, dz)
      - pos:  FreeCAD上での配置位置 (x, y, z)（Z軸を高さ方向とする）
      - cut_w / cut_d / cut_t: 木取り（カットリスト）用の平面寸法・厚み
    """
    inner_height = height_mm - 2 * thickness_mm
    if inner_height <= 0:
        raise ValueError(f"高さ({height_mm}mm)が板厚×2({thickness_mm * 2}mm)以下です。高さを見直してください。")

    return [
        {
            "label": "天板",
            "material": material,
            "size": (width_mm, depth_mm, thickness_mm),
            "pos": (0, 0, height_mm - thickness_mm),
            "cut_w": width_mm,
            "cut_d": depth_mm,
            "cut_t": thickness_mm,
        },
        {
            "label": "底板",
            "material": material,
            "size": (width_mm, depth_mm, thickness_mm),
            "pos": (0, 0, 0),
            "cut_w": width_mm,
            "cut_d": depth_mm,
            "cut_t": thickness_mm,
        },
        {
            "label": "側板",
            "material": material,
            "size": (thickness_mm, depth_mm, inner_height),
            "pos": (0, 0, thickness_mm),
            "cut_w": depth_mm,
            "cut_d": inner_height,
            "cut_t": thickness_mm,
        },
        {
            "label": "側板",
            "material": material,
            "size": (thickness_mm, depth_mm, inner_height),
            "pos": (width_mm - thickness_mm, 0, thickness_mm),
            "cut_w": depth_mm,
            "cut_d": inner_height,
            "cut_t": thickness_mm,
        },
        {
            "label": "背板",
            "material": material,
            "size": (width_mm, back_thickness_mm, inner_height),
            "pos": (0, depth_mm - back_thickness_mm, thickness_mm),
            "cut_w": width_mm,
            "cut_d": inner_height,
            "cut_t": back_thickness_mm,
        },
    ]


def build_freecad_document(panels, output_path):
    """FreeCADドキュメントにパネルを組み立て、.FCStdとして保存する。"""
    try:
        import FreeCAD as App  # noqa: N814  (FreeCAD公式の慣例に合わせたimport名)
        import Part
    except ImportError as exc:
        raise RuntimeError(
            "FreeCAD / Partモジュールをimportできませんでした。このスクリプトは通常のpython3ではなく、"
            "FreeCAD付属のfreecadcmd（またはFreeCADCmd）から実行してください。"
        ) from exc

    doc = App.newDocument("TaneiFurniture")
    for i, panel in enumerate(panels):
        dx, dy, dz = panel["size"]
        x, y, z = panel["pos"]
        box_shape = Part.makeBox(dx, dy, dz, App.Vector(x, y, z))
        obj = doc.addObject("Part::Feature", f"Panel_{i}_{panel['label']}")
        obj.Shape = box_shape
        obj.Label = panel["label"]

    doc.recompute()
    doc.saveAs(output_path)
    return output_path


def write_cutlist_csv(panels, output_path):
    """freecad-integration（Phase1の木取り最適化エンジン）がそのまま読み込めるCSVを書き出す。

    同一寸法・同一材質・同一厚みのパネルはqtyとして集約する（例: 側板×2枚 → 1行、枚数2）。
    """
    grouped = {}
    for panel in panels:
        key = (panel["label"], panel["cut_w"], panel["cut_d"], panel["cut_t"], panel["material"])
        grouped[key] = grouped.get(key, 0) + 1

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["品名", "幅", "奥行", "厚み", "材質", "枚数"])
        for (label, cut_w, cut_d, cut_t, material), qty in grouped.items():
            writer.writerow([label, cut_w, cut_d, cut_t, material, qty])

    return output_path


# 材質名から、POV-Rayでのおおよその色味を決める簡易テーブル（プロトタイプ用の最小実装）
MATERIAL_COLORS = {
    "パイン集成材": "0.85, 0.70, 0.48",
    "シナベニヤ": "0.90, 0.80, 0.62",
    "ラワン合板": "0.72, 0.55, 0.38",
    "SPF材": "0.88, 0.78, 0.60",
    "OSB合板": "0.75, 0.62, 0.42",
}
DEFAULT_MATERIAL_COLOR = "0.80, 0.65, 0.45"


def generate_pov_scene(panels, width_mm, depth_mm, height_mm, material, output_path):
    """パネル構成から、POV-Ray用のシーンファイル(.pov)をテキストとして生成する。

    メッシュ変換を経由せず、天板・底板・側板・背板をそのままbox{}プリミティブとして
    書き出すことで、FreeCADモデルと完全に同じ寸法をレンダリングに反映させる。
    """
    color = MATERIAL_COLORS.get(material, DEFAULT_MATERIAL_COLOR)

    box_entries = []
    for panel in panels:
        x, y, z = panel["pos"]
        dx, dy, dz = panel["size"]
        box_entries.append(
            f"  box {{ <{x}, {y}, {z}>, <{x + dx}, {y + dy}, {z + dz}> texture {{ WoodTexture }} }}"
        )

    cam_distance = max(width_mm, depth_mm, height_mm) * 2.4
    scene = f"""// TANE:i FreeCAD Studio - auto-generated POV-Ray scene
// 元になったパラメータ: width={width_mm}mm depth={depth_mm}mm height={height_mm}mm material={material}

#include "colors.inc"

global_settings {{ assumed_gamma 1.0 }}

camera {{
  location <{width_mm * 1.4}, -{cam_distance}, {height_mm * 1.6}>
  sky <0, 0, 1>
  look_at <{width_mm / 2}, {depth_mm / 2}, {height_mm / 2}>
  angle 38
}}

light_source {{ <{width_mm * 2}, -{depth_mm * 3}, {height_mm * 3}> color rgb <1, 1, 0.97> }}
light_source {{ <-{width_mm * 0.8}, -{depth_mm * 1.2}, {height_mm * 2}> color rgb <0.35, 0.35, 0.4> }}

background {{ color rgb <0.98, 0.97, 0.94> }}

plane {{
  <0, 0, 1>, -1
  pigment {{ color rgb <0.93, 0.92, 0.89> }}
  finish {{ diffuse 0.9 }}
}}

#declare WoodTexture = texture {{
  pigment {{ color rgb <{color}> }}
  finish {{ diffuse 0.75 specular 0.25 roughness 0.06 }}
}}

{chr(10).join(box_entries)}
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(scene)

    return output_path


def render_with_povray(pov_path, output_png_path, width_px=1000, height_px=750):
    """povrayコマンドをサブプロセスとして呼び出し、.povからPNGをレンダリングする。"""
    povray_bin = os.environ.get("POVRAY_PATH", "povray")

    cmd = [
        povray_bin,
        f"+I{pov_path}",
        f"+O{output_png_path}",
        f"+W{width_px}",
        f"+H{height_px}",
        "+A0.3",  # アンチエイリアス
        "+Q9",  # 品質
        "-D",  # ディスプレイプレビューを無効化（サーバー環境向け）
        "/EXIT",  # レンダリング後に自動終了（Windows版povray向け、Linux/Macでは無視される）
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"povrayコマンド（'{povray_bin}'）が見つかりません。POV-Rayがインストールされているか、"
            f"POVRAY_PATH環境変数で実行ファイルの場所を指定してください。"
        ) from exc

    if result.returncode != 0:
        raise RuntimeError(
            f"povrayの実行に失敗しました（終了コード {result.returncode}）。\n"
            f"POVRAY_PATH環境変数でpovrayの実行ファイルパスを指定できます。\n"
            f"--- stderr ---\n{result.stderr}"
        )
    return output_png_path


def main():
    parser = argparse.ArgumentParser(description="TANE:i FreeCAD Studio - furniture model generator")
    parser.add_argument("--item", default="家具", help="品名（例: テレビ台）")
    parser.add_argument("--width", type=float, required=True, help="幅(mm)")
    parser.add_argument("--depth", type=float, required=True, help="奥行(mm)")
    parser.add_argument("--height", type=float, required=True, help="高さ(mm)")
    parser.add_argument("--thickness", type=float, default=DEFAULT_THICKNESS_MM, help="板厚(mm)")
    parser.add_argument("--material", default="パイン集成材", help="材質名")
    parser.add_argument("--output-dir", required=True, help="生成物の出力先ディレクトリ")

    # freecadcmdは `freecadcmd script.py -- --foo bar` のように渡された引数を
    # そのままsys.argvへ引き継ぐが、環境によって先頭にスクリプトパス自体が
    # 含まれることがあるため、parse_known_argsで余計な引数を無視する
    args, _unknown = parser.parse_known_args()

    os.makedirs(args.output_dir, exist_ok=True)

    panels = compute_panels(
        args.width, args.depth, args.height, args.thickness, DEFAULT_BACK_THICKNESS_MM, args.material
    )

    fcstd_path = os.path.join(args.output_dir, "model.FCStd")
    csv_path = os.path.join(args.output_dir, "cutlist.csv")
    pov_path = os.path.join(args.output_dir, "scene.pov")
    png_path = os.path.join(args.output_dir, "render.png")

    build_freecad_document(panels, fcstd_path)
    write_cutlist_csv(panels, csv_path)
    generate_pov_scene(panels, args.width, args.depth, args.height, args.material, pov_path)
    render_with_povray(pov_path, png_path)

    result = {
        "item": args.item,
        "model": fcstd_path,
        "cutlistCsv": csv_path,
        "renderPng": png_path,
        "panelCount": len(panels),
    }
    # server.py側はこの行だけを標準出力から探してパースする
    print("RESULT_JSON:" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001  (freecadcmd呼び出し元に必ずエラー内容を返すため意図的に広く捕捉)
        print("ERROR_JSON:" + json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
