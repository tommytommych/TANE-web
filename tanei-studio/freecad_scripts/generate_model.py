"""
FreeCADのPython環境（freecadcmd）で実行する、家具モデル生成スクリプト。

このスクリプトは通常のpython3ではなく、FreeCAD付属のPythonインタプリタ
（freecadcmd / FreeCADCmd）から実行する前提。`FreeCAD`・`Part`モジュールは
FreeCAD本体にバンドルされており、一般的なpip環境にはインストールできない。

実行例:
    ※freecadcmdは独自のCLIパーサーを持ち、一般的な `--` 以降パススルーの慣習を尊重しないため、
      パラメータはコマンドライン引数ではなく環境変数 TANEI_PARAMS_JSON で渡す（詳細はmain()参照）。

    TANEI_PARAMS_JSON='{"item":"テレビ台","width":1200,"depth":400,"height":400,"thickness":18,"material":"パイン集成材","panelFinishes":{"天板":"walnut","側板":"white"},"options":{"legs":{"enabled":true,"heightMm":100,"count":4},"stack":{"enabled":true},"shelf_h":{"tier1":1,"tier2":2}},"outputDir":"./renders/job123"}' \\
        freecadcmd generate_model.py

    panelFinishesは省略可能で、指定が無いパーツはデフォルトの"clear"（材質そのものの木目）になる。
    指定できる値: "clear"（クリア塗装）/ "walnut"（ウォルナット調）/ "white"（ホワイト）/ "black"（ブラック）

    optionsも省略可能で、扉・脚・棚板などの追加パーツを個別に有効化できる（キー・パラメータの
    一覧はFOUNDATION_PART_DEFS／TIER_PART_DEFS参照）。"legs"/"apron"/"caster_block"は
    本体最下部にのみ取り付く土台パーツ、"stack"は2段目(tier2)を追加するトグル、それ以外
    （"door"/"drawer_front"/"pillars"/"divider_v"/"shelf_h"/"back_batten"）は
    { "tier1": 個数, "tier2": 個数 } の形で段ごとの取り付け数を指定する。

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
import math
import os
import subprocess
import sys

DEFAULT_THICKNESS_MM = 18
RENDER_WIDTH_PX = 1000
RENDER_HEIGHT_PX = 750
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


BASE_PANEL_LABELS = ("天板", "底板", "側板", "背板")


def _finish_for(label, panel_finishes):
    """指定した品名（パネルのlabel）に対応するfinishを、panel_finishesから安全に取り出す。
    未指定・不正な値の場合はDEFAULT_FINISH（クリア塗装）にフォールバックする。
    天板・底板・側板・背板の基本4種だけでなく、扉・脚などの追加パーツのlabelにも使える。
    """
    value = (panel_finishes or {}).get(label, DEFAULT_FINISH)
    return value if value in FINISH_OPTIONS else DEFAULT_FINISH


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

    return [
        {
            "label": "天板",
            "material": material,
            "finish": _finish_for("天板", panel_finishes),
            "size": (width_mm, depth_mm, thickness_mm),
            "pos": (0, 0, height_mm - thickness_mm),
            "cut_w": width_mm,
            "cut_d": depth_mm,
            "cut_t": thickness_mm,
        },
        {
            "label": "底板",
            "material": material,
            "finish": _finish_for("底板", panel_finishes),
            "size": (width_mm, depth_mm, thickness_mm),
            "pos": (0, 0, 0),
            "cut_w": width_mm,
            "cut_d": depth_mm,
            "cut_t": thickness_mm,
        },
        {
            "label": "側板",
            "material": material,
            "finish": _finish_for("側板", panel_finishes),
            "size": (thickness_mm, depth_mm, inner_height),
            "pos": (0, 0, thickness_mm),
            "cut_w": depth_mm,
            "cut_d": inner_height,
            "cut_t": thickness_mm,
        },
        {
            "label": "側板",
            "material": material,
            "finish": _finish_for("側板", panel_finishes),
            "size": (thickness_mm, depth_mm, inner_height),
            "pos": (width_mm - thickness_mm, 0, thickness_mm),
            "cut_w": depth_mm,
            "cut_d": inner_height,
            "cut_t": thickness_mm,
        },
        {
            "label": "背板",
            "material": material,
            "finish": _finish_for("背板", panel_finishes),
            "size": (width_mm, back_thickness_mm, inner_height),
            "pos": (0, depth_mm - back_thickness_mm, thickness_mm),
            "cut_w": width_mm,
            "cut_d": inner_height,
            "cut_t": back_thickness_mm,
        },
    ]


## --- テーブル（天板+脚+幕板、箱体なし）---
## 天板・底板・側板・背板からなる箱型とは構造そのものが異なる家具タイプ（TANE:iブラウザCAD
## 側のFurnitureDesign.kind:'table'に対応）。既存のFOUNDATION_PART_DEFS（脚・幕板・
## キャスター）は「常に存在する箱本体の下に取り付く飾り足」という構造（z=0＝箱の底板下面から
## 下向き）のため再利用できない（脚が本体の主要な高さを構成するテーブルとは根本的に構造が
## 異なる）。定数・計算式はブラウザCAD側（app/lib/cad/geometry.tsのbuildDefaultTablePanels、
## TypeScript側の実装）と完全に一致させ、CADと完成イメージの寸法がズレないようにしている

TABLE_LEG_SIZE_MM = 40
TABLE_LEG_INSET_MM = 20
TABLE_APRON_HEIGHT_MM = 80

# SPF材の規格材としての実寸（厚み×幅）。app/lib/constants.tsのKOHNAN_WOOD_LISTの
# 'SPF材（1×4）'（厚19×幅89mm）・'SPF材（2×4）'（厚38×幅89mm）エントリ、および
# TypeScript側（app/lib/cad/geometry.ts）と同じ値。脚・幕板の材料としてこれらが
# 選ばれた場合のみ、この実寸を断面に反映する。区別なしの"SPF材"は従来通り2×4相当のまま
SPF_1X4_THICKNESS_MM = 19
SPF_1X4_WIDTH_MM = 89
SPF_2X4_THICKNESS_MM = 38
SPF_2X4_WIDTH_MM = 89


def _resolve_dimensional_lumber_cross_section(material):
    """材料名が既知の規格材（SPF材／SPF材（1×4）／SPF材（2×4））に一致する場合のみ、
    実際の断面（厚み, 幅）のタプルを返す。一致しない場合はNoneを返し、呼び出し側で
    従来通りの既定断面にフォールバックさせる
    （app/lib/cad/geometry.tsのresolveDimensionalLumberCrossSectionと同じ判定）。"""
    if material == "SPF材（1×4）":
        return SPF_1X4_THICKNESS_MM, SPF_1X4_WIDTH_MM
    if material in ("SPF材（2×4）", "SPF材"):
        return SPF_2X4_THICKNESS_MM, SPF_2X4_WIDTH_MM
    return None


def _resolve_leg_cross_section(leg_material):
    """脚の材料が既知の規格材（SPF材系）の場合のみ実際の断面を使う。それ以外の材料
    （未指定含む）では従来通りの正方形断面（40×40mm）のまま
    （app/lib/cad/geometry.tsのresolveLegCrossSectionと同じ判定）。"""
    cross = _resolve_dimensional_lumber_cross_section(leg_material)
    if cross:
        return cross
    return TABLE_LEG_SIZE_MM, TABLE_LEG_SIZE_MM


def _resolve_apron_cross_section(apron_material, default_thickness_mm):
    """幕板の材料が既知の規格材（SPF材系）の場合のみ実際の断面（厚み・見付け高さ）を使う。
    それ以外の材料（未指定含む）では従来通り、板厚（thickness_mm）を厚みに、
    TABLE_APRON_HEIGHT_MMを見付け高さに使う
    （app/lib/cad/geometry.tsのresolveApronCrossSectionと同じ判定）。"""
    cross = _resolve_dimensional_lumber_cross_section(apron_material)
    if cross:
        return cross
    return default_thickness_mm, TABLE_APRON_HEIGHT_MM


def compute_table_panels(width_mm, depth_mm, height_mm, thickness_mm, material, panel_finishes=None, part_materials=None):
    """テーブル（天板1枚+脚4本+幕板4枚）のパネル構成を計算する。compute_panels()と対になる
    関数で、天板・底板・側板・背板といった箱型固有の語彙は一切使わない。

    脚は床（z=0）から天板下面（legHeight=height_mm-thickness_mm）まで届くフルハイトで配置し、
    幕板は天板のすぐ下で隣り合う脚同士をつなぐ枠として配置する（実際の仕口を厳密に再現する
    ものではなく、木取り図・3D表示・完成イメージ向けの簡易的な構造表現）。

    part_materials（脚・幕板のみパーツ単位で材料を指定する任意の辞書）にSPF材が
    指定されている場合、該当パーツの断面を実寸2×4（38×89mm）に変更する
    （app/lib/cad/geometry.tsのbuildDefaultTablePanelsと完全に一致する計算式）。
    """
    if width_mm <= 0 or depth_mm <= 0 or height_mm <= 0 or thickness_mm <= 0:
        raise ValueError("width/depth/height/thicknessは正の数値で指定してください。")

    leg_material = (part_materials or {}).get("脚", material)
    apron_material = (part_materials or {}).get("幕板", material)
    leg_w_x, leg_w_y = _resolve_leg_cross_section(leg_material)
    apron_t, apron_h = _resolve_apron_cross_section(apron_material, thickness_mm)

    leg_height = height_mm - thickness_mm
    if leg_height <= apron_h:
        raise ValueError(f"高さ({height_mm}mm)が天板の厚み・幕板の高さに対して小さすぎます。")

    leg_x1 = TABLE_LEG_INSET_MM
    leg_x2 = width_mm - TABLE_LEG_INSET_MM - leg_w_x
    leg_y1 = TABLE_LEG_INSET_MM
    leg_y2 = depth_mm - TABLE_LEG_INSET_MM - leg_w_y
    if leg_x2 <= leg_x1 or leg_y2 <= leg_y1:
        raise ValueError("widthまたはdepthが脚を配置するには小さすぎます。")

    def _panel(label, pos, size):
        return {
            "label": label,
            "material": material,
            "finish": _finish_for(label, panel_finishes),
            "size": size,
            "pos": pos,
            "cut_w": size[0],
            "cut_d": size[1],
            "cut_t": size[2],
        }

    panels = [
        _panel("天板", (0, 0, height_mm - thickness_mm), (width_mm, depth_mm, thickness_mm)),
        _panel("脚（前左）", (leg_x1, leg_y1, 0), (leg_w_x, leg_w_y, leg_height)),
        _panel("脚（前右）", (leg_x2, leg_y1, 0), (leg_w_x, leg_w_y, leg_height)),
        _panel("脚（奥左）", (leg_x1, leg_y2, 0), (leg_w_x, leg_w_y, leg_height)),
        _panel("脚（奥右）", (leg_x2, leg_y2, 0), (leg_w_x, leg_w_y, leg_height)),
    ]

    apron_z = leg_height - apron_h
    apron_span_x = leg_x2 - (leg_x1 + leg_w_x)
    apron_span_y = leg_y2 - (leg_y1 + leg_w_y)

    panels.append(_panel(
        "幕板（前）", (leg_x1 + leg_w_x, leg_y1, apron_z), (apron_span_x, apron_t, apron_h)
    ))
    panels.append(_panel(
        "幕板（奥）",
        (leg_x1 + leg_w_x, leg_y2 + leg_w_y - apron_t, apron_z),
        (apron_span_x, apron_t, apron_h),
    ))
    panels.append(_panel(
        "幕板（左）", (leg_x1, leg_y1 + leg_w_y, apron_z), (apron_t, apron_span_y, apron_h)
    ))
    panels.append(_panel(
        "幕板（右）",
        (leg_x2 + leg_w_x - apron_t, leg_y1 + leg_w_y, apron_z),
        (apron_t, apron_span_y, apron_h),
    ))

    return panels


## --- 追加パーツ（オプションパーツ）---
## 基本の箱（天板・底板・側板・背板）に加えて、扉・脚・棚板などの追加パーツを
## 選択式で組み込めるようにする。各オプションパーツの生成関数は、compute_panels()と
## 全く同じ形のパネル辞書（label/material/finish/size/pos/cut_w/cut_d/cut_t）を返す。
## この形さえ守れば、FreeCADモデリング（build_freecad_document）・POV-Rayレンダリング
## （generate_pov_scene）・木取りCSV（write_cutlist_csv）・3Dビューア・簡易プレビューの
## いずれも、base_panels + option_panels のように単純に連結するだけで自動的に対応でき、
## 追加パーツ専用のコードをこれらの関数側に書く必要が一切ない。

# 角材・台座パーツの断面寸法・位置の目安（mm）。実測に基づく固定値ではなく、
# 一般的な木工DIYでよく使われるサイズを初期値として採用している
LEG_CROSS_SECTION_MM = 30
PILLAR_CROSS_SECTION_MM = 30
BATTEN_HEIGHT_MM = 30
CORNER_INSET_MM = 15
CASTER_WHEEL_WIDTH_MM = 15  # タイヤの車軸方向(奥行き=Y軸)の厚み


# 土台パーツ（脚・幕板・キャスター台座）: 本体最下部（1段目の下）にのみ取り付く。
# 段（tier）の選択肢は無く、UIもチェックボックス+パラメータの単純な形のまま
# （「脚を天板側に取り付ける」といった誤操作を、UIの制約ではなく仕組みそのもので防ぐため）。
FOUNDATION_PART_DEFS = {
    "legs": {
        "label": "脚",
        "description": "本体下面に取り付ける角材の脚（4本または6本）",
        "params": {
            "heightMm": {"label": "高さ(mm)", "default": 100, "min": 30, "max": 400},
            "count": {"label": "本数", "default": 4, "min": 4, "max": 6},
        },
    },
    "apron": {
        "label": "幕板",
        "description": "脚同士をつなぐ補強レール（本体前後面の下部）",
        "params": {"heightMm": {"label": "見付け高さ(mm)", "default": 60, "min": 30, "max": 120}},
    },
    "caster_block": {
        "label": "キャスター",
        "description": "本体下面四隅に取り付ける小さいキャスター（タイヤ状の円柱）",
        "params": {"diameterMm": {"label": "直径(mm)", "default": 40, "min": 20, "max": 60}},
    },
}

# 本体2段重ね。段をもう1つ（tier2）追加するだけのシンプルなenabledトグル。
# tier2にどのパーツをいくつ取り付けるかは、下のTIER_PART_DEFSの各パーツごとに指定する
STACK_PART_DEF = {"label": "本体2段重ね", "description": "同じ本体をもう1段、真上に積み重ねる"}

# 段（1段目=tier1／本体2段重ね有効時のみtier2）に、個数を指定して取り付けられるパーツ。
# UI（static/index.html）側のドラッグ&ドロップ配置図で、パーツのアイコンを1段目・2段目の
# ゾーンにドロップするたびにtier1/tier2の個数が1つずつ増える仕組みなので、
# enabledフラグではなく「個数（0なら未使用）」で状態を持つ
TIER_PART_DEFS = {
    "door": {"label": "扉", "max_per_tier": 2},
    "drawer_front": {"label": "引き出し前板", "max_per_tier": 15},
    "pillars": {"label": "支柱", "max_per_tier": 4},
    "divider_v": {"label": "縦仕切り", "max_per_tier": 3},
    "shelf_h": {"label": "横棚板", "max_per_tier": 4},
    "back_batten": {"label": "背面補強桟", "max_per_tier": 4},
}

# 塗装・仕上げ（panelFinishes）を個別指定できる品名の一覧。基本4種＋土台パーツ＋
# 段のパーツすべてに対応する（_finish_for()はlabelさえ一致すればどのパーツにも使えるため、
# 新しいパーツを追加した際はここに登録するだけでUI・APIの両方から色指定できるようになる）
ALL_FINISHABLE_LABELS = (
    BASE_PANEL_LABELS
    + tuple(d["label"] for d in FOUNDATION_PART_DEFS.values())
    + tuple(d["label"] for d in TIER_PART_DEFS.values())
)

# パーツ単位で材料を指定できる品名の一覧。TypeScript側のPartMaterialLabel
# （app/lib/cad/model.ts）と同じ語彙。「天板だけパイン集成材、脚・幕板はSPF材」のような
# 指定を、AIの提案（StudioSpec.partMaterials）からそのままこちらでも解釈できるようにする
PART_MATERIAL_LABELS = ("天板", "底板", "側板", "背板", "棚板", "脚", "幕板")


def apply_part_materials(panels, part_materials):
    """生成済みのpanelsに対して、パーツ単位の材料上書き（part_materials）を後から適用する。

    compute_panels()・compute_table_panels()・compute_option_panels()自体は変更せず、
    ここ1箇所だけでpanel["material"]を上書きする（TypeScript側のbuildFurnitureModelが
    幾何計算後にpanel.materialを上書きする設計と同じ考え方）。各パネルのlabelを「（」で
    分割して代表ラベル（例:「脚（前左）」→「脚」）を求め、PART_MATERIAL_LABELSに含まれ、
    かつpart_materialsにそのキーがあれば上書きする。該当しないパネルは、生成時点で既に
    設定済みのmaterialのまま変更しない。
    """
    if not part_materials:
        return panels
    for panel in panels:
        key = panel["label"].split("（")[0]
        if key not in PART_MATERIAL_LABELS:
            continue
        value = part_materials.get(key)
        if isinstance(value, str) and value.strip():
            panel["material"] = value
    return panels


def _resolve_foundation_params(key, opt):
    """土台パーツ（脚・幕板・キャスター台座）1つについて、渡されたパラメータを
    FOUNDATION_PART_DEFSのmin/maxでクランプし、未指定分はdefaultで補って返す。
    countパラメータは整数に丸める。
    """
    resolved = {}
    for param_key, meta in FOUNDATION_PART_DEFS[key]["params"].items():
        raw = opt.get(param_key, meta["default"])
        try:
            value = float(raw)
        except (TypeError, ValueError):
            value = meta["default"]
        value = max(meta["min"], min(meta["max"], value))
        if param_key == "count":
            value = int(round(value))
        resolved[param_key] = value
    return resolved


def _option_context(width_mm, depth_mm, height_mm, thickness_mm, back_thickness_mm):
    """オプションパーツの座標計算でよく使う「内寸」をまとめて計算する。"""
    return {
        "width": width_mm,
        "depth": depth_mm,
        "height": height_mm,
        "thickness": thickness_mm,
        "back_thickness": back_thickness_mm,
        "inner_w": width_mm - 2 * thickness_mm,
        "inner_h": height_mm - 2 * thickness_mm,
        "inner_d": depth_mm - back_thickness_mm,
    }


# 隣接する扉・引き出し前板の間に設ける見切り用の隙間（mm）。実物の建具でも扉と扉の間には
# 数mm程度の目地（クリアランス）があるため、その再現を兼ねる。この隙間が無いと、同じ
# テクスチャの箱同士が完全に接して継ぎ目が無くなり、POV-Rayの完成イメージでは複数枚では
# なく1枚の板に見えてしまう（3Dビュー・Three.jsはパネルごとに黒いエッジ線を描画するため、
# 隙間が無くてもパネルの境目が視認できてしまい、両者の見た目が食い違う原因になっていた）。
PANEL_GAP_MM = 3


def _split_with_gap(total, count, gap=PANEL_GAP_MM):
    """total(mm)をcount個に、隙間gapを挟んで均等に分割し、[(開始位置, 幅), ...] を返す。
    count<=1の場合は隙間なしでtotal全体を1個として返す。
    """
    if count <= 1:
        return [(0, total)]
    seg = (total - gap * (count - 1)) / count
    return [(i * (seg + gap), seg) for i in range(count)]


def _option_door(ctx, params, material, panel_finishes):
    """本体前面（y=0の開口部）を覆う扉。count=2で観音開き（左右分割）にする。
    複数枚の場合はPANEL_GAP_MM分の隙間を挟んで配置し、レンダリング上も
    はっきり別々の扉として見えるようにする。
    """
    label = TIER_PART_DEFS["door"]["label"]
    count = int(params["count"])
    t = ctx["thickness"]
    inner_w, inner_h = ctx["inner_w"], ctx["inner_h"]
    finish = _finish_for(label, panel_finishes)
    return [
        {
            "label": label,
            "material": material,
            "finish": finish,
            "size": (leaf_w, t, inner_h),
            "pos": (t + offset, -t, t),
            "cut_w": leaf_w,
            "cut_d": inner_h,
            "cut_t": t,
        }
        for offset, leaf_w in _split_with_gap(inner_w, count)
    ]


def _column_bounds(inner_w, t, divider_count):
    """縦仕切りの本数から、区切られた列ごとの(x開始位置, 列幅)のリストを返す。

    _option_divider_v()と全く同じ位置計算（中心座標）を使うことで、引き出し前板が
    区切り板にぴったり収まる列幅になる。divider_count=0なら1列（全幅）を返す。
    """
    if divider_count <= 0:
        return [(t, inner_w)]
    centers = [t + (i + 1) * inner_w / (divider_count + 1) for i in range(divider_count)]
    bounds = []
    prev_right = t
    for cx in centers:
        left_edge = cx - t / 2
        bounds.append((prev_right, left_edge - prev_right))
        prev_right = cx + t / 2
    bounds.append((prev_right, t + inner_w - prev_right))
    return bounds


def _option_drawer_front(ctx, params, material, panel_finishes):
    """前面の引き出し前板。countで縦方向に段数分割する（扉が左右分割なのに対し、こちらは上下分割）。
    同じ列内で複数段になる場合はPANEL_GAP_MM分の隙間を挟み、レンダリング上もはっきり
    別々の引き出しとして見えるようにする。

    同じ段に縦仕切り（divider_v）がある場合は、params["divider_count"]（compute_option_panels
    が同じ段のdivider_v個数を調べて渡す）に応じて、区切られた列ごとにcountを均等に振り分け、
    列の幅に収まるように配置する（例: 仕切り1本→2列に分けて左右に引き出しを並べられる）。
    """
    label = TIER_PART_DEFS["drawer_front"]["label"]
    count = int(params["count"])
    divider_count = int(params.get("divider_count", 0))
    t = ctx["thickness"]
    inner_w, inner_h = ctx["inner_w"], ctx["inner_h"]
    finish = _finish_for(label, panel_finishes)

    columns = _column_bounds(inner_w, t, divider_count)
    n_cols = len(columns)
    base_count, extra = divmod(count, n_cols)

    panels = []
    for col_index, (x_left, col_w) in enumerate(columns):
        col_count = base_count + (1 if col_index < extra else 0)
        if col_count == 0:
            continue
        for offset, front_h in _split_with_gap(inner_h, col_count):
            panels.append(
                {
                    "label": label,
                    "material": material,
                    "finish": finish,
                    "size": (col_w, t, front_h),
                    "pos": (x_left, -t, t + offset),
                    "cut_w": col_w,
                    "cut_d": front_h,
                    "cut_t": t,
                }
            )
    return panels


def _option_legs(ctx, params, material, panel_finishes):
    """本体下面（z=0）から下方向に伸びる角材の脚。4本は四隅、6本は四隅+左右中央にも追加する。"""
    label = FOUNDATION_PART_DEFS["legs"]["label"]
    leg_h = params["heightMm"]
    count = int(params["count"])
    width, depth = ctx["width"], ctx["depth"]
    finish = _finish_for(label, panel_finishes)
    cs = LEG_CROSS_SECTION_MM
    inset = CORNER_INSET_MM
    x_positions = (
        [inset, width - inset - cs] if count <= 4 else [inset, (width - cs) / 2, width - inset - cs]
    )
    y_positions = [inset, depth - inset - cs]
    return [
        {
            "label": label,
            "material": material,
            "finish": finish,
            "size": (cs, cs, leg_h),
            "pos": (x, y, -leg_h),
            # 角材は「長さ×断面×断面」として記録する（cut_w=長さ）。フラットパネルの
            # cut_w/cut_d（面の縦横）とは意味が異なるが、木取り表の列自体は共通のため流用する
            "cut_w": leg_h,
            "cut_d": cs,
            "cut_t": cs,
        }
        for x in x_positions
        for y in y_positions
    ]


def _option_apron(ctx, params, material, panel_finishes):
    """脚同士をつなぐ幕板（前面・背面の下部に取り付ける薄板のレール）。"""
    label = FOUNDATION_PART_DEFS["apron"]["label"]
    h = params["heightMm"]
    t = ctx["thickness"]
    width, depth = ctx["width"], ctx["depth"]
    finish = _finish_for(label, panel_finishes)
    rail_w = width - 2 * CORNER_INSET_MM
    return [
        {
            "label": label,
            "material": material,
            "finish": finish,
            "size": (rail_w, t, h),
            "pos": (CORNER_INSET_MM, y, -h),
            "cut_w": rail_w,
            "cut_d": h,
            "cut_t": t,
        }
        for y in (0, depth - t)
    ]


def _option_pillars(ctx, params, material, panel_finishes):
    """本体前面に追加する角材の支柱（間口が広い棚などの中間支持を想定）。"""
    label = TIER_PART_DEFS["pillars"]["label"]
    count = int(params["count"])
    t = ctx["thickness"]
    inner_w, inner_h = ctx["inner_w"], ctx["inner_h"]
    finish = _finish_for(label, panel_finishes)
    cs = PILLAR_CROSS_SECTION_MM
    panels = []
    for i in range(count):
        x = t + (i + 1) * inner_w / (count + 1) - cs / 2
        panels.append(
            {
                "label": label,
                "material": material,
                "finish": finish,
                "size": (cs, cs, inner_h),
                "pos": (x, 0, t),
                "cut_w": inner_h,
                "cut_d": cs,
                "cut_t": cs,
            }
        )
    return panels


def _tier2_base_panels(ctx, material, panel_finishes):
    """本体2段重ね有効時の2段目本体（天板・底板・側板・背板）。compute_panels()をそのまま
    再利用し、高さ分だけz座標をずらす。ラベルは基本の5枚と同じにするため、木取りCSVでは
    同一規格として枚数が自動的に加算される（例: 天板が2枚になる）。
    """
    width, depth, height = ctx["width"], ctx["depth"], ctx["height"]
    t, bt = ctx["thickness"], ctx["back_thickness"]
    tier2_panels = compute_panels(width, depth, height, t, bt, material, panel_finishes)
    for p in tier2_panels:
        x, y, z = p["pos"]
        p["pos"] = (x, y, z + height)
    return tier2_panels


def _option_divider_v(ctx, params, material, panel_finishes):
    """内部を左右に区切る縦仕切り板。countの数だけ内寸を等分する位置に配置する。"""
    label = TIER_PART_DEFS["divider_v"]["label"]
    count = int(params["count"])
    t = ctx["thickness"]
    inner_w, inner_h, inner_d = ctx["inner_w"], ctx["inner_h"], ctx["inner_d"]
    finish = _finish_for(label, panel_finishes)
    panels = []
    for i in range(count):
        x = t + (i + 1) * inner_w / (count + 1) - t / 2
        panels.append(
            {
                "label": label,
                "material": material,
                "finish": finish,
                "size": (t, inner_d, inner_h),
                "pos": (x, 0, t),
                "cut_w": inner_d,
                "cut_d": inner_h,
                "cut_t": t,
            }
        )
    return panels


def _option_shelf_h(ctx, params, material, panel_finishes):
    """内部の高さ方向を区切る横棚板。countの数だけ内寸の高さを等分する位置に配置する。"""
    label = TIER_PART_DEFS["shelf_h"]["label"]
    count = int(params["count"])
    t = ctx["thickness"]
    inner_w, inner_h, inner_d = ctx["inner_w"], ctx["inner_h"], ctx["inner_d"]
    finish = _finish_for(label, panel_finishes)
    panels = []
    for i in range(count):
        z = t + (i + 1) * inner_h / (count + 1) - t / 2
        panels.append(
            {
                "label": label,
                "material": material,
                "finish": finish,
                "size": (inner_w, inner_d, t),
                "pos": (t, 0, z),
                "cut_w": inner_w,
                "cut_d": inner_d,
                "cut_t": t,
            }
        )
    return panels


def _option_back_batten(ctx, params, material, panel_finishes):
    """背板の内側に取り付ける補強用の桟。countが1本なら中央、2本以上なら上下均等に配置する。"""
    label = TIER_PART_DEFS["back_batten"]["label"]
    count = int(params["count"])
    t = ctx["thickness"]
    inner_w, inner_h = ctx["inner_w"], ctx["inner_h"]
    depth, bt = ctx["depth"], ctx["back_thickness"]
    finish = _finish_for(label, panel_finishes)
    y = depth - bt - t
    panels = []
    for i in range(count):
        if count == 1:
            z = t + inner_h / 2 - BATTEN_HEIGHT_MM / 2
        else:
            z = t + i * (inner_h - BATTEN_HEIGHT_MM) / (count - 1)
        panels.append(
            {
                "label": label,
                "material": material,
                "finish": finish,
                "size": (inner_w, t, BATTEN_HEIGHT_MM),
                "pos": (t, y, z),
                "cut_w": inner_w,
                "cut_d": BATTEN_HEIGHT_MM,
                "cut_t": t,
            }
        )
    return panels


def _option_caster_block(ctx, params, material, panel_finishes):
    """本体下面四隅に取り付ける小さいキャスター。実物のタイヤのように、円柱の軸を
    水平（奥行き＝Y軸）方向に向けて「縦向き」に配置する（円形の側面が正面から見える）。
    軸を高さ方向にした「パック」のような向きだと、レンダリングでは影に紛れてほぼ見えず、
    3Dビューとの見た目の食い違いが生じていたため、この向きに修正した。

    sizeはボックス系パーツと形を揃えるため(直径, タイヤ幅, 直径)のタプルで持つ
    （dx/dzが円の直径、dyが車軸方向の厚み）。位置(pos)は他パーツと同じくバウンディング
    ボックスの左下手前コーナー座標で、z=-diameterから0（本体最下部）まで、
    ちょうど直径分だけ下に伸びて床に接地する。
    """
    label = FOUNDATION_PART_DEFS["caster_block"]["label"]
    diameter = params["diameterMm"]
    wheel_width = CASTER_WHEEL_WIDTH_MM
    width, depth = ctx["width"], ctx["depth"]
    finish = _finish_for(label, panel_finishes)
    inset = CORNER_INSET_MM
    return [
        {
            "label": label,
            "material": material,
            "finish": finish,
            "shape": "wheel",
            "size": (diameter, wheel_width, diameter),
            "pos": (x, y, -diameter),
            "cut_w": diameter,
            "cut_d": diameter,
            "cut_t": wheel_width,
        }
        for x in (inset, width - inset - diameter)
        for y in (inset, depth - inset - wheel_width)
    ]


FOUNDATION_GENERATORS = {
    "legs": _option_legs,
    "apron": _option_apron,
    "caster_block": _option_caster_block,
}

TIER_GENERATORS = {
    "door": _option_door,
    "drawer_front": _option_drawer_front,
    "pillars": _option_pillars,
    "divider_v": _option_divider_v,
    "shelf_h": _option_shelf_h,
    "back_batten": _option_back_batten,
}


def compute_option_panels(width_mm, depth_mm, height_mm, thickness_mm, back_thickness_mm, material, panel_finishes, options):
    """有効化された追加パーツ（扉・脚・棚板など）のパネル一覧を計算する。

    optionsは3種類のキーを持つ:
      - 土台パーツ（"legs"/"apron"/"caster_block"）: { "enabled": true, ...パラメータ }。
        常に本体最下部にのみ取り付く（段の指定はできない）。
      - "stack": { "enabled": true } のみ。有効なら本体の2段目（tier2）を追加する。
      - 段に取り付けるパーツ（"door"/"drawer_front"/"pillars"/"divider_v"/"shelf_h"/
        "back_batten"）: { "tier1": 個数, "tier2": 個数 }。tier2はstackが有効な場合のみ
        反映され、無効な場合は指定があっても無視する（UIの制約に加えて、ここでも
        「2段目が無いのに2段目にパーツを置く」ような不整合な状態を最終防衛する）。

    戻り値はcompute_panels()と同じ形のパネル辞書のリストなので、呼び出し側は
    `base_panels + compute_option_panels(...)` と連結するだけでよい。
    """
    options = options or {}
    ctx = _option_context(width_mm, depth_mm, height_mm, thickness_mm, back_thickness_mm)
    panels = []

    for key, generator in FOUNDATION_GENERATORS.items():
        opt = options.get(key)
        if not opt or not opt.get("enabled"):
            continue
        params = _resolve_foundation_params(key, opt)
        panels.extend(generator(ctx, params, material, panel_finishes))

    stack_opt = options.get("stack")
    has_tier2 = bool(stack_opt and stack_opt.get("enabled"))
    if has_tier2:
        panels.extend(_tier2_base_panels(ctx, material, panel_finishes))

    for key, generator in TIER_GENERATORS.items():
        tier_opt = options.get(key)
        if not isinstance(tier_opt, dict):
            continue
        max_per_tier = TIER_PART_DEFS[key]["max_per_tier"]
        for tier_index in (1, 2):
            if tier_index == 2 and not has_tier2:
                continue
            try:
                count = int(tier_opt.get(f"tier{tier_index}", 0))
            except (TypeError, ValueError):
                count = 0
            count = max(0, min(max_per_tier, count))
            if count == 0:
                continue
            part_params = {"count": count}
            if key == "drawer_front":
                # 同じ段にある縦仕切りの本数を調べ、列分割の基準にする（無ければ0=全幅1列のまま）
                divider_opt = options.get("divider_v") or {}
                try:
                    divider_count = int(divider_opt.get(f"tier{tier_index}", 0))
                except (TypeError, ValueError):
                    divider_count = 0
                part_params["divider_count"] = max(
                    0, min(TIER_PART_DEFS["divider_v"]["max_per_tier"], divider_count)
                )
            tier_panels = generator(ctx, part_params, material, panel_finishes)
            z_offset = (tier_index - 1) * height_mm
            for p in tier_panels:
                x, y, z = p["pos"]
                p["pos"] = (x, y, z + z_offset)
            panels.extend(tier_panels)

    return panels


# キャスター（"shape": "wheel"）は木材ではなくゴム/樹脂のタイヤなので、他パーツと違い
# "clear"（材質そのものの木目）を選んでも木目にはせず、既定でダークグレーのゴム色にする。
# black/whiteを明示指定した場合はそれぞれより濃い黒・明るいプラスチック風グレーにする
# （walnutは見た目上の意味を持たないため、既定のゴム色にフォールバックする）
WHEEL_FINISH_COLOR = {
    "clear": "0.12, 0.12, 0.12",
    "walnut": "0.12, 0.12, 0.12",
    "white": "0.75, 0.75, 0.75",
    "black": "0.02, 0.02, 0.02",
}


def _apply_panel_color(obj, panel, material_color_lookup):
    """パネルのfinishに応じたRGBを、GUI無し（freecadcmd）でも設定できる
    ShapeMaterial（App::Material、DiffuseColor）へ反映する。

    【実機検証で確認】freecadcmd（GUI無し）では従来のobj.ViewObject.ShapeColorは
    ViewObjectがNoneのため使えないが、FreeCAD 1.1系のMaterialsフレームワークによる
    obj.ShapeMaterial.setAppearanceValue("DiffuseColor", ...)は非GUI環境でも動作する。
    あくまでFreeCAD文書を後でGUIで開いた際の見た目用（実際のレンダリングはPOV-Ray側で行う）。
    """
    finish = panel.get("finish", DEFAULT_FINISH)
    if panel.get("shape") == "wheel":
        rgb_csv = WHEEL_FINISH_COLOR.get(finish, WHEEL_FINISH_COLOR["clear"])
    elif finish == "clear":
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
        if panel.get("shape") == "wheel":
            # キャスターはタイヤのように軸を水平（奥行き=Y軸）方向に向けた円柱として表現する
            # （dx/dzが直径として等しい前提、dyが車軸方向＝円柱の長さ）
            radius = dx / 2
            shape = Part.makeCylinder(radius, dy, App.Vector(x + radius, y, z + radius), App.Vector(0, 1, 0))
        else:
            shape = Part.makeBox(dx, dy, dz, App.Vector(x, y, z))
        obj = doc.addObject("Part::Feature", f"Panel_{i}_{panel['label']}")
        obj.Shape = shape
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
    "SPF材（1×4）": "0.88, 0.78, 0.60",
    "SPF材（2×4）": "0.88, 0.78, 0.60",
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
    "SPF材（1×4）": "T_Wood11",  # SPF材と同じ樹種のため同じテクスチャ
    "SPF材（2×4）": "T_Wood11",  # SPF材と同じ樹種のため同じテクスチャ
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

    if panel.get("shape") == "wheel":
        r, g, b = (float(v) for v in WHEEL_FINISH_COLOR.get(finish, WHEEL_FINISH_COLOR["clear"]).split(","))
        return (
            f"texture {{ pigment {{ color rgb <{r}, {g}, {b}> }} "
            "finish { diffuse 0.5 specular 0.5 roughness 0.08 } }"
        )

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


def _panels_bounding_box(panels):
    """全パネルを包む外接直方体（min/max のx,y,z）を計算する。

    脚（本体下面より下）・扉（本体前面より手前）・本体2段重ね（本体の上）のように、
    追加パーツは基本の外形寸法（width/depth/height）の範囲をはみ出すことがあるため、
    カメラ・地面の配置は生の外形寸法ではなく、実際のパネル構成から計算した外接直方体を
    基準にする必要がある。
    """
    xs_min = min(p["pos"][0] for p in panels)
    xs_max = max(p["pos"][0] + p["size"][0] for p in panels)
    ys_min = min(p["pos"][1] for p in panels)
    ys_max = max(p["pos"][1] + p["size"][1] for p in panels)
    zs_min = min(p["pos"][2] for p in panels)
    zs_max = max(p["pos"][2] + p["size"][2] for p in panels)
    return xs_min, xs_max, ys_min, ys_max, zs_min, zs_max


def _vec_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _vec_cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _vec_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _vec_normalize(a):
    length = math.sqrt(_vec_dot(a, a))
    return (a[0] / length, a[1] / length, a[2] / length)


# カメラの視線方向（固定の方位角・仰角）と画角、被写体まわりの余白の比率。
# 家具の縦横比によらず常に画面中央にバランス良く収まるよう、_compute_camera()で
# この視線方向に対して外接直方体がちょうど収まる距離を毎回計算し直す
CAMERA_AZIMUTH_DEG = 35
CAMERA_ELEVATION_DEG = 22
CAMERA_H_FOV_DEG = 38
CAMERA_MARGIN = 1.2


def _compute_camera(panels, image_width_px, image_height_px):
    """全パネルの外接直方体が、指定のアスペクト比の画角にちょうど中央へ収まるような
    カメラの位置・注視点を計算する。

    【背景】以前は「カメラのオフセット = 外接直方体の各辺の生の長さ × 適当な係数」
    というヒューリスティックで計算しており、家具の縦横比（幅に対して極端に低い/高い等）
    によっては画面内の余白バランスが崩れ、完成イメージが3Dビューと比べて被写体が
    中央からずれて見える不具合があった。ここでは固定の視線方向（方位角・仰角）を
    決め打ちしたうえで、外接直方体の8頂点をカメラのright/up軸へ投影して必要な
    半画角を求め、水平・垂直それぞれの画角にちょうど収まる距離を計算することで、
    縦横比によらず被写体が常に画面中央に一定の余白で収まるようにしている
    （look_atに指定した点は常に画像の中心に投影されるため、この点を外接直方体の
    幾何学的な中心にすることで、水平・垂直それぞれの必要半画角が一致する＝
    上下左右の余白が揃う設計にしている）。
    """
    min_x, max_x, min_y, max_y, min_z, max_z = _panels_bounding_box(panels)
    center = ((min_x + max_x) / 2, (min_y + max_y) / 2, (min_z + max_z) / 2)

    azimuth = math.radians(CAMERA_AZIMUTH_DEG)
    elevation = math.radians(CAMERA_ELEVATION_DEG)
    # 正面（開口部側、y=0が最小）から見つつ、方位角・仰角の分だけ傾けた視線方向。
    # view_dirは「カメラから注視点へ向かう向き」で、カメラは注視点よりYが小さい
    # （手前＝開口部の外側）・Zが高い（見下ろす）位置に置きたいので、
    # Y成分は正（カメラ→注視点でYが増える向き）、Z成分は負（カメラ→注視点でZが下がる向き）にする
    view_dir = _vec_normalize((
        math.sin(azimuth) * math.cos(elevation),
        math.cos(azimuth) * math.cos(elevation),
        -math.sin(elevation),
    ))
    world_up = (0.0, 0.0, 1.0)
    right = _vec_normalize(_vec_cross(view_dir, world_up))
    up = _vec_cross(right, view_dir)

    corners = [
        (x, y, z)
        for x in (min_x, max_x)
        for y in (min_y, max_y)
        for z in (min_z, max_z)
    ]
    half_width = max(abs(_vec_dot(_vec_sub(c, center), right)) for c in corners)
    half_height = max(abs(_vec_dot(_vec_sub(c, center), up)) for c in corners)

    h_fov = math.radians(CAMERA_H_FOV_DEG)
    aspect = image_width_px / image_height_px
    v_fov = 2 * math.atan(math.tan(h_fov / 2) / aspect)

    distance = max(
        half_width / math.tan(h_fov / 2),
        half_height / math.tan(v_fov / 2),
    ) * CAMERA_MARGIN

    location = (
        center[0] - view_dir[0] * distance,
        center[1] - view_dir[1] * distance,
        center[2] - view_dir[2] * distance,
    )
    return location, center


def generate_pov_scene(panels, width_mm, depth_mm, height_mm, material, output_path):
    """パネル構成から、POV-Ray用のシーンファイル(.pov)をテキストとして生成する。

    メッシュ変換を経由せず、天板・底板・側板・背板（および追加パーツ）をそのまま
    box{}プリミティブとして書き出すことで、FreeCADモデルと完全に同じ寸法を
    レンダリングに反映させる。パネルごとに個別のfinish（クリア塗装/ウォルナット調/
    ホワイト/ブラック）をテクスチャとして割り当てるため、単一のWoodTextureではなく
    パネルごとに生成する。カメラ・地面は_panels_bounding_box()の外接直方体を基準に
    配置するため、脚や扉などで基本の外形寸法をはみ出しても正しく画角に収まる。
    """
    box_entries = []
    for panel in panels:
        x, y, z = panel["pos"]
        dx, dy, dz = panel["size"]
        texture_block = _panel_pov_texture(panel)
        if panel.get("shape") == "wheel":
            # タイヤのように軸を水平（奥行き=Y軸）方向に向けた円柱にする
            radius = dx / 2
            cx, cz = x + radius, z + radius
            box_entries.append(
                f"  cylinder {{ <{cx}, {y}, {cz}>, <{cx}, {y + dy}, {cz}>, {radius} {texture_block} }}"
            )
        else:
            box_entries.append(f"  box {{ <{x}, {y}, {z}>, <{x + dx}, {y + dy}, {z + dz}> {texture_block} }}")

    min_x, max_x, min_y, max_y, min_z, max_z = _panels_bounding_box(panels)
    bbox_w = max_x - min_x
    bbox_d = max_y - min_y
    bbox_h = max_z - min_z
    (cam_x, cam_y, cam_z), (look_x, look_y, look_z) = _compute_camera(
        panels, RENDER_WIDTH_PX, RENDER_HEIGHT_PX
    )
    # ライトはカメラとほぼ同じ側（正面〜やや斜め）から当てるが、位置そのものは
    # カメラよりだいぶ近く・高くして、影の付き方が不自然にならないようにする
    key_light = (cam_x + bbox_w * 0.4, cam_y * 0.5 + look_y * 0.5, cam_z + bbox_h * 0.6)
    fill_light = (look_x - bbox_w * 0.6, cam_y * 0.7 + look_y * 0.3, look_z + bbox_h * 1.2)

    scene = f"""// TANE:i FreeCAD Studio - auto-generated POV-Ray scene
// 元になったパラメータ: width={width_mm}mm depth={depth_mm}mm height={height_mm}mm material={material}
// カメラは追加パーツ込みの全パネル外接直方体（{bbox_w:.0f}x{bbox_d:.0f}x{bbox_h:.0f}mm）が
// 画角にちょうど中央へ収まるよう_compute_camera()で毎回計算し直している

#include "colors.inc"
#include "woods.inc"

global_settings {{ assumed_gamma 1.0 }}

camera {{
  location <{cam_x}, {cam_y}, {cam_z}>
  sky <0, 0, 1>
  look_at <{look_x}, {look_y}, {look_z}>
  angle {CAMERA_H_FOV_DEG}
}}

light_source {{ <{key_light[0]}, {key_light[1]}, {key_light[2]}> color rgb <1, 1, 0.97> }}
light_source {{ <{fill_light[0]}, {fill_light[1]}, {fill_light[2]}> color rgb <0.35, 0.35, 0.4> }}

background {{ color rgb <0.98, 0.97, 0.94> }}

plane {{
  <0, 0, 1>, {min_z - 1}
  pigment {{ color rgb <0.93, 0.92, 0.89> }}
  finish {{ diffuse 0.9 }}
}}

{chr(10).join(box_entries)}
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(scene)

    return output_path


def render_with_povray(pov_path, output_png_path, width_px=RENDER_WIDTH_PX, height_px=RENDER_HEIGHT_PX):
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
    # 「天板だけパイン集成材、脚・幕板はSPF材」のような、パーツ単位の材料指定（任意）。
    # kind:"table"の場合、脚・幕板の断面計算（compute_table_panels）にも渡す
    part_materials = params.get("partMaterials") or {}
    options = params.get("options") or {}
    # kind未指定・不正値は既存仕様どおり'box'として扱う（後方互換。TANE:iブラウザCAD側の
    # FurnitureDesign.kindと同じ考え方）
    kind = params.get("kind") if params.get("kind") in ("box", "table") else "box"
    output_dir = params["outputDir"]

    os.makedirs(output_dir, exist_ok=True)

    if kind == "table":
        # テーブルは箱本体を持たないため、天板+脚+幕板のみで構成する
        # （既存のcompute_option_panelsによる脚・幕板追加は箱本体前提のため使わない）
        panels = compute_table_panels(width, depth, height, thickness, material, panel_finishes, part_materials)
    else:
        panels = compute_panels(width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes)
        panels += compute_option_panels(
            width, depth, height, thickness, DEFAULT_BACK_THICKNESS_MM, material, panel_finishes, options
        )
    # 天板・底板・側板・背板・棚板（box）や、テーブルの各パーツラベルに、パーツ単位の
    # 材料指定を反映する（脚・幕板の断面自体は上のcompute_table_panelsが既に反映済みのため、
    # ここでは主にbox側のパーツラベルへの反映と、テーブル側の再確認を兼ねる）
    panels = apply_part_materials(panels, part_materials)

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
