"""
FreeCAD / POV-Rayが未インストールの開発環境でも、UI・APIの一連の流れを実際に動かして
確認できるようにするための「簡易プレビュー」モード。

generate_model.compute_panels() が計算する実際の寸法データをそのまま使い、
等角投影（アイソメトリック図）のSVGを純粋なPython（追加ライブラリなし）で描画する。
あくまで開発時の動作確認用であり、FreeCAD＋POV-Rayによる本来の完成イメージ
レンダリング（写実的な質感・陰影）の代わりにはならない点に注意。
"""

import math

COS30 = math.cos(math.radians(30))
SIN30 = math.sin(math.radians(30))

# 材質名からプレビューの色味を決める簡易テーブル（generate_model.pyのMATERIAL_COLORSと対応）
MATERIAL_HEX = {
    "パイン集成材": "#d9b285",
    "シナベニヤ": "#e6cca3",
    "ラワン合板": "#b78a5f",
    "SPF材": "#e0c799",
    "OSB合板": "#c19f6b",
}
DEFAULT_MATERIAL_HEX = "#cca675"

# finishが材質そのもの（clear）以外の場合の色（generate_model.pyのFINISH_APPROX_COLORと対応）
FINISH_HEX = {
    "walnut": "#3d2617",
    "white": "#ede9e0",
    "black": "#121212",
}

# キャスター（"shape": "wheel"）は木材ではなくゴム/樹脂のタイヤなので、他パーツと違い
# clearでも木目色にはせずダークグレーのゴム色にする（generate_model.pyのWHEEL_FINISH_COLORと対応）
WHEEL_FINISH_HEX = {
    "clear": "#1e1e1e",
    "walnut": "#1e1e1e",
    "white": "#bfbfbf",
    "black": "#050505",
}


def _panel_hex_color(panel):
    """パネルのfinishに応じた色（clearの場合は材質の色）を返す。"""
    finish = panel.get("finish", "clear")
    if panel.get("shape") == "wheel":
        return WHEEL_FINISH_HEX.get(finish, WHEEL_FINISH_HEX["clear"])
    if finish in FINISH_HEX:
        return FINISH_HEX[finish]
    return MATERIAL_HEX.get(panel.get("material"), DEFAULT_MATERIAL_HEX)


def _iso(x, y, z):
    """3D座標(mm)を、等角投影の2Dスクリーン座標へ変換する。"""
    sx = (x - y) * COS30
    sy = (x + y) * SIN30 - z
    return sx, sy


def _shade(hex_color, factor):
    """簡易的な明暗調整（面ごとに濃淡をつけて立体感を出すため）。"""
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    r, g, b = (max(0, min(255, int(c * factor))) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def _box_faces(x0, y0, z0, x1, y1, z1):
    """直方体の見える3面（上面・正面・側面）を、それぞれ4点のリストとして返す。"""
    top = [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    front = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)]
    side = [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]
    return [("top", top, 1.0), ("front", front, 0.75), ("side", side, 0.55)]


def render_iso_preview_svg(panels, item_label, material):
    """panels（generate_model.compute_panelsの出力）から、等角投影のSVG文字列を生成する。

    パネルごとのfinish（クリア塗装/ウォルナット調/ホワイト/ブラック）を反映するため、
    色はパネル単位で決める（単一のbase_colorを全パネルに使い回さない）。
    """
    all_points = []
    polygons = []

    for panel in panels:
        x, y, z = panel["pos"]
        dx, dy, dz = panel["size"]
        base_color = _panel_hex_color(panel)

        if panel.get("shape") == "wheel":
            # 円柱(タイヤ)は簡易プレビューでは中心位置の小さな楕円として表現する
            cx3d, cy3d, cz3d = x + dx / 2, y + dy / 2, z + dz / 2
            cx2d, cy2d = _iso(cx3d, cy3d, cz3d)
            radius_2d = dx / 2 * COS30
            all_points.extend(
                [(cx2d - radius_2d, cy2d - radius_2d), (cx2d + radius_2d, cy2d + radius_2d)]
            )
            polygons.append(
                f'<ellipse cx="{cx2d:.1f}" cy="{cy2d:.1f}" rx="{radius_2d:.1f}" ry="{radius_2d * 0.6:.1f}" '
                f'fill="{base_color}" stroke="#111" stroke-width="1" />'
            )
            continue

        for face_name, corners, shade_factor in _box_faces(x, y, z, x + dx, y + dy, z + dz):
            projected = [_iso(*c) for c in corners]
            all_points.extend(projected)
            points_attr = " ".join(f"{px:.1f},{py:.1f}" for px, py in projected)
            polygons.append(
                f'<polygon points="{points_attr}" fill="{_shade(base_color, shade_factor)}" '
                f'stroke="#3a2f27" stroke-width="1.5" stroke-linejoin="round" />'
            )

    min_x = min(p[0] for p in all_points)
    max_x = max(p[0] for p in all_points)
    min_y = min(p[1] for p in all_points)
    max_y = max(p[1] for p in all_points)
    pad = max(max_x - min_x, max_y - min_y) * 0.12 + 20
    view_w = (max_x - min_x) + pad * 2
    view_h = (max_y - min_y) + pad * 2
    view_x = min_x - pad
    view_y = min_y - pad

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_x:.1f} {view_y:.1f} {view_w:.1f} {view_h:.1f}"
     width="800" height="{int(800 * view_h / view_w)}">
  <rect x="{view_x:.1f}" y="{view_y:.1f}" width="{view_w:.1f}" height="{view_h:.1f}" fill="#faf8f4" />
  {chr(10).join(polygons)}
  <text x="{view_x + 12:.1f}" y="{view_y + view_h - 16:.1f}" font-size="{view_w * 0.028:.1f}"
        font-family="sans-serif" fill="#8a8a8a">
    簡易プレビュー（FreeCAD/POV-Ray未接続） - {item_label} / {material}
  </text>
</svg>"""
