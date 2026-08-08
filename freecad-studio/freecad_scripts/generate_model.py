"""
FreeCADのPython環境（freecadcmd）で実行する、家具モデル生成スクリプト。

このスクリプトは通常のpython3ではなく、FreeCAD付属のPythonインタプリタ
（freecadcmd / FreeCADCmd）から実行する前提。`FreeCAD`・`Part`モジュールは
FreeCAD本体にバンドルされており、一般的なpip環境にはインストールできない。

実行例:
    ※freecadcmdは独自のCLIパーサーを持ち、一般的な `--` 以降パススルーの慣習を尊重しないため、
      パラメータはコマンドライン引数ではなく環境変数 TANEI_PARAMS_JSON で渡す（詳細はmain()参照）。

    TANEI_PARAMS_JSON='{"item":"テレビ台","width":1200,"depth":400,"height":400,"thickness":18,"material":"パイン集成材","panelFinishes":{"天板":"walnut","側板":"white"},"outputDir":"./renders/job123"}' \\
        freecadcmd generate_model.py

    panelFinishesは省略可能で、指定が無いパーツはデフォルトの"clear"（材質そのものの木目）になる。
    指定できる値: "clear"（クリア塗装）/ "walnut"（ウォルナット調）/ "white"（ホワイト）/ "black"（ブラック）

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

import csv
import json
import os
import subprocess
import sys

DEFAULT_THICKNESS_MM = 18
DEFAULT_BACK_THICKNESS_MM = 5.5


# パーツごとに指定できる塗装・仕上げの選択肢。"clear"（クリア塗装）は選択した材質そのものの
# 木目を活かす仕上げ、それ以外は木目の上に色を乗せる／隠す仕上げを表す
FINISH_OPTIONS = ("clear", "walnut", "white", "black")
DEFAULT_FINISH = "clear"

FINISH_LABELS = {
    "clear": "クリア塗装",
    "walnut": "ウォルナット調",
    "white": "ホワイト",
    "black": "ブラック",
}

# FreeCAD側のShapeMaterial（App::Material、GUI無しでも設定可能）や、Web UIの3Dビューアに
# 渡すおおよその色。POV-Ray側の実際の質感はgenerate_pov_sceneの木目テクスチャ・finishで決まるため、
# これはあくまで「ざっくりした色の目安」
FINISH_APPROX_COLOR = {
    "walnut": "0.24, 0.15, 0.09",
    "white": "0.93, 0.92, 0.88",
    "black": "0.07, 0.07, 0.07",
}


def compute_panels(width_mm, depth_mm, height_mm, thickness_mm, back_thickness_mm, material, panel_finishes=None):
    """家具の外形寸法から、天板・底板・側板×2・背板のパネル構成を計算する。

    各パネルは以下を持つ:
      - size: FreeCAD上でのbox寸法 (dx, dy, dz)
      - pos:  FreeCAD上での配置位置 (x, y, z)（Z軸を高さ方向とする）
      - cut_w / cut_d / cut_t: 木取り（カットリスト）用の平面寸法・厚み
      - finish: このパネル個別の塗装・仕上げ（"clear"/"walnut"/"white"/"black"）。
                panel_finishesで品名（天板・底板・側板・背板）ごとに指定できる
    """
    inner_height = height_mm - 2 * thickness_mm
    if inner_height <= 0:
        raise ValueError(f"高さ({height_mm}mm)が板厚×2({thickness_mm * 2}mm)以下です。高さを見直してください。")

    panel_finishes = panel_finishes or {}

    def finish_for(label):
        value = panel_finishes.get(label, DEFAULT_FINISH)
        return value if value in FINISH_OPTIONS else DEFAULT_FINISH

    return [
        {
            "label": "天板",
            "material": material,
            "finish": finish_for("天板"),
            "size": (width_mm, depth_mm, thickness_mm),
            "pos": (0, 0, height_mm - thickness_mm),
            "cut_w": width_mm,
            "cut_d": depth_mm,
            "cut_t": thickness_mm,
        },
        {
            "label": "底板",
            "material": material,
            "finish": finish_for("底板"),
            "size": (width_mm, depth_mm, thickness_mm),
            "pos": (0, 0, 0),
            "cut_w": width_mm,
            "cut_d": depth_mm,
            "cut_t": thickness_mm,
        },
        {
            "label": "側板",
            "material": material,
            "finish": finish_for("側板"),
            "size": (thickness_mm, depth_mm, inner_height),
            "pos": (0, 0, thickness_mm),
            "cut_w": depth_mm,
            "cut_d": inner_height,
            "cut_t": thickness_mm,
        },
        {
            "label": "側板",
            "material": material,
            "finish": finish_for("側板"),
            "size": (thickness_mm, depth_mm, inner_height),
            "pos": (width_mm - thickness_mm, 0, thickness_mm),
            "cut_w": depth_mm,
            "cut_d": inner_height,
            "cut_t": thickness_mm,
        },
        {
            "label": "背板",
            "material": material,
            "finish": finish_for("背板"),
            "size": (width_mm, back_thickness_mm, inner_height),
            "pos": (0, depth_mm - back_thickness_mm, thickness_mm),
            "cut_w": width_mm,
            "cut_d": inner_height,
            "cut_t": back_thickness_mm,
        },
    ]


def _apply_panel_color(obj, panel, material_color_lookup):
    """パネルのfinishに応じたRGBを、GUI無し（freecadcmd）でも設定できる
    ShapeMaterial（App::Material、DiffuseColor）へ反映する。

    【実機検証で確認】freecadcmd（GUI無し）では従来のobj.ViewObject.ShapeColorは
    ViewObjectがNoneのため使えないが、FreeCAD 1.1系のMaterialsフレームワークによる
    obj.ShapeMaterial.setAppearanceValue("DiffuseColor", ...)は非GUI環境でも動作する。
    あくまでFreeCAD文書を後でGUIで開いた際の見た目用（実際のレンダリングはPOV-Ray側で行う）。
    """
    finish = panel.get("finish", DEFAULT_FINISH)
    if finish == "clear":
        rgb_csv = material_color_lookup(panel["material"])
    else:
        rgb_csv = FINISH_APPROX_COLOR.get(finish, material_color_lookup(panel["material"]))
    r, g, b = (float(v) for v in rgb_csv.split(","))

    try:
        sm = obj.ShapeMaterial
        sm.setAppearanceValue("DiffuseColor", f"({r}, {g}, {b}, 1.0)")
        obj.ShapeMaterial = sm
    except Exception:  # noqa: BLE001  (FreeCADのバージョンによりMaterialsフレームワークが
        # 無い/挙動が異なる可能性があるため、失敗しても致命的にはしない（POV-Ray側の見た目には影響しない）
        pass


def build_freecad_document(panels, output_path, material_color_lookup=None):
    """FreeCADドキュメントにパネルを組み立て、パネルごとに色を設定して.FCStdとして保存する。"""
    try:
        import FreeCAD as App  # noqa: N814  (FreeCAD公式の慣例に合わせたimport名)
        import Part
    except ImportError as exc:
        raise RuntimeError(
            "FreeCAD / Partモジュールをimportできませんでした。このスクリプトは通常のpython3ではなく、"
            "FreeCAD付属のfreecadcmd（またはFreeCADCmd）から実行してください。"
        ) from exc

    material_color_lookup = material_color_lookup or (lambda _material: DEFAULT_MATERIAL_COLOR)

    doc = App.newDocument("TaneiFurniture")
    for i, panel in enumerate(panels):
        dx, dy, dz = panel["size"]
        x, y, z = panel["pos"]
        box_shape = Part.makeBox(dx, dy, dz, App.Vector(x, y, z))
        obj = doc.addObject("Part::Feature", f"Panel_{i}_{panel['label']}")
        obj.Shape = box_shape
        obj.Label = panel["label"]
        _apply_panel_color(obj, panel, material_color_lookup)

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


# 材質名から、POV-Rayでのおおよその色味（clear仕上げの目安）を決める簡易テーブル
MATERIAL_COLORS = {
    "パイン集成材": "0.85, 0.70, 0.48",
    "シナベニヤ": "0.90, 0.80, 0.62",
    "ラワン合板": "0.72, 0.55, 0.38",
    "SPF材": "0.88, 0.78, 0.60",
    "OSB合板": "0.75, 0.62, 0.42",
}
DEFAULT_MATERIAL_COLOR = "0.80, 0.65, 0.45"

# 材質ごとに、POV-Ray付属woods.incの木目テクスチャ（層状のpigment+turbulenceで構成された
# 本物らしい木目パターン）から見た目が近いものを割り当てる。単色pigmentよりも
# 木目・節・色ムラが表現され、質感が大きく向上する
MATERIAL_WOOD_TEXTURE = {
    "パイン集成材": "T_Wood10",  # Soft pine（明るい黄色みの、なめらかな木目）
    "シナベニヤ": "T_Wood13",    # 直線的でまっすぐな木目、白っぽい
    "ラワン合板": "T_Wood15",    # 中間色の茶色
    "SPF材": "T_Wood11",         # Spruce（黄色みの強い、まっすぐで細かい木目）
    "OSB合板": "T_Wood9",        # 不規則なうねり（OSB特有のチップ感に近い）
}
DEFAULT_WOOD_TEXTURE = "T_Wood10"

# 「ウォルナット調」は材質に関わらず、ウォルナット色に着色した仕上げとして固定のテクスチャを使う
WALNUT_WOOD_TEXTURE = "T_Wood12"  # Very dark brown. Walnut-stained pine

# 木目パターンのスケール（mm単位）。値が大きいほど年輪の間隔が広くなる。
# 実際にレンダリングして目視で調整した値
WOOD_TEXTURE_SCALE_MM = 300


def _panel_pov_texture(panel):
    """パネル1枚分のPOV-Rayテクスチャブロックを、finishに応じて生成する。

    - clear: 材質に応じた木目（woods.inc）をそのまま活かす
    - walnut: ウォルナット色に着色された木目（woods.inc）
    - white / black: 木目を隠す均一な塗装（pigment）。白はやや艶あり、黒はより艶のある
      仕上げにして「塗装らしさ」を出す
    木目パターンの原点をパネルの中心付近にずらすことで、パネルが家具のどこにあっても
    年輪が偏らず視認できるようにしている
    """
    finish = panel.get("finish", DEFAULT_FINISH)
    x, y, z = panel["pos"]
    dx, dy, dz = panel["size"]
    cx, cy, cz = x + dx / 2, y + dy / 2, z + dz / 2

    if finish == "white":
        return (
            "texture { pigment { color rgb <0.93, 0.92, 0.88> } "
            "finish { diffuse 0.75 specular 0.45 roughness 0.02 } }"
        )
    if finish == "black":
        return (
            "texture { pigment { color rgb <0.07, 0.07, 0.07> } "
            "finish { diffuse 0.55 specular 0.6 roughness 0.015 reflection 0.12 } }"
        )

    wood_macro = WALNUT_WOOD_TEXTURE if finish == "walnut" else MATERIAL_WOOD_TEXTURE.get(
        panel["material"], DEFAULT_WOOD_TEXTURE
    )
    return (
        f"texture {{ {wood_macro} "
        f"scale {WOOD_TEXTURE_SCALE_MM} rotate y*90 translate <{cx}, {cy}, {cz}> "
        f"finish {{ specular 0.3 roughness 0.05 }} }}"
    )


def generate_pov_scene(panels, width_mm, depth_mm, height_mm, material, output_path):
    """パネル構成から、POV-Ray用のシーンファイル(.pov)をテキストとして生成する。

    メッシュ変換を経由せず、天板・底板・側板・背板をそのままbox{}プリミティブとして
    書き出すことで、FreeCADモデルと完全に同じ寸法をレンダリングに反映させる。
    パネルごとに個別のfinish（クリア塗装/ウォルナット調/ホワイト/ブラック）を
    テクスチャとして割り当てるため、単一のWoodTextureではなくパネルごとに生成する。
    """
    box_entries = []
    for panel in panels:
        x, y, z = panel["pos"]
        dx, dy, dz = panel["size"]
        texture_block = _panel_pov_texture(panel)
        box_entries.append(f"  box {{ <{x}, {y}, {z}>, <{x + dx}, {y + dy}, {z + dz}> {texture_block} }}")

    cam_distance = max(width_mm, depth_mm, height_mm) * 2.4
    scene = f"""// TANE:i FreeCAD Studio - auto-generated POV-Ray scene
// 元になったパラメータ: width={width_mm}mm depth={depth_mm}mm height={height_mm}mm material={material}

#include "colors.inc"
#include "woods.inc"

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
    ]
    # 【重要・実機検証で判明】"/EXIT"はWindows版povray向けのオプションで、Mac/Linux版では
    # 無視されず "Failed to parse command-line option" として実行自体が失敗する。
    # Mac/Linuxのpovrayは元々レンダリング後にプロセスが自動終了するため、このオプション自体が不要。

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
    # 【重要】FreeCADのfreecadcmdは、boost::program_optionsベースの独自CLIパーサーを持ち、
    # 一般的な `script.py -- --foo bar` のような「--以降はスクリプトへそのまま渡す」慣習を
    # 尊重しない（`--pass`という専用オプションはあるが、値を1つしか受け付けず、複数の
    # --key value ペアを引き継ぐには向かない）。この問題を確実に避けるため、パラメータは
    # コマンドライン引数ではなく環境変数 TANEI_PARAMS_JSON（JSON文字列）で受け渡す。
    params_json = os.environ.get("TANEI_PARAMS_JSON")
    if not params_json:
        raise RuntimeError(
            "環境変数 TANEI_PARAMS_JSON が設定されていません。"
            "server.py経由ではなく直接実行する場合は、JSON文字列をこの環境変数に設定してください。"
        )
    params = json.loads(params_json)

    item = params.get("item", "家具")
    width = float(params["width"])
    depth = float(params["depth"])
    height = float(params["height"])
    thickness = float(params.get("thickness", DEFAULT_THICKNESS_MM))
    material = params.get("material", "パイン集成材")
    panel_finishes = params.get("panelFinishes") or {}
    output_dir = params["outputDir"]

    os.makedirs(output_dir, exist_ok=True)

    panels = compute_panels(width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes)

    fcstd_path = os.path.join(output_dir, "model.FCStd")
    csv_path = os.path.join(output_dir, "cutlist.csv")
    pov_path = os.path.join(output_dir, "scene.pov")
    png_path = os.path.join(output_dir, "render.png")

    build_freecad_document(
        panels, fcstd_path, material_color_lookup=lambda m: MATERIAL_COLORS.get(m, DEFAULT_MATERIAL_COLOR)
    )
    write_cutlist_csv(panels, csv_path)
    generate_pov_scene(panels, width, depth, height, material, pov_path)
    render_with_povray(pov_path, png_path)

    return {
        "item": item,
        "model": fcstd_path,
        "cutlistCsv": csv_path,
        "renderPng": png_path,
        "panelCount": len(panels),
    }


# 【重要】freecadcmdはスクリプトを「モジュールとしてimport」する形で実行し、__name__は
# "__main__"にならない（実際に検証して確認: ファイル名から拡張子を除いた文字列になる）。
# そのため `if __name__ == "__main__":` では絶対に実行されず、main()が呼ばれないまま
# 静かに終了してしまう。TANEI_PARAMS_JSON環境変数の有無を「実際に生成を実行すべきか」の
# 判定に使うことで、freecadcmdからの直接実行と、server.py等からのヘルパー関数の
# import利用（compute_panels等だけを使いたい場合）の両方を正しく区別する。
#
# 【重要】結果・エラーは標準出力ではなく output_dir/result.json ファイルに書き出す。
# freecadcmd経由の実行では、print()の出力がサブプロセスのキャプチャに正しく反映されない
# （バッファリングの都合か、sys.exit()前にflushされない）ケースを実際に確認したため、
# ファイル書き込みという、より確実な方法で呼び出し元（server.py）に結果を伝える。
if os.environ.get("TANEI_PARAMS_JSON"):
    _params = json.loads(os.environ["TANEI_PARAMS_JSON"])
    _output_dir = _params.get("outputDir", ".")
    os.makedirs(_output_dir, exist_ok=True)
    _result_path = os.path.join(_output_dir, "result.json")
    try:
        _result = main()
        with open(_result_path, "w", encoding="utf-8") as _f:
            json.dump({"ok": True, **_result}, _f, ensure_ascii=False)
    except Exception as exc:  # noqa: BLE001  (freecadcmd呼び出し元に必ずエラー内容を返すため意図的に広く捕捉)
        with open(_result_path, "w", encoding="utf-8") as _f:
            json.dump({"ok": False, "error": str(exc)}, _f, ensure_ascii=False)
        sys.exit(1)
