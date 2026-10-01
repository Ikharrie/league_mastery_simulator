# Analyzes the parchment background image to detect slot indents and
# outputs a SLOT_LEGACY array in 1024x615 logical coords, ordered by the
# in-game fill order (Mark 1, 4, 7, 11, 14, 17, 21, 24, 27 etc.).

import os
import sys
from PIL import Image

HERE        = os.path.dirname(os.path.abspath(__file__))
IMG_PATH    = os.path.join(HERE, "images", "runes", "summoners_runes_bg.jpg")
LOGICAL_W   = 1024
LOGICAL_H   = 615
DARK_THRESH = 110      # captures the lighter quint hexes too
MIN_AREA    = 1500
MAX_AREA    = 6000
ASPECT_MIN  = 0.7      # hex-shaped only (~1:1); exclude long thin text
ASPECT_MAX  = 1.4

# Legacy fill-order positions from the legacy-lol-client.vercel.app HTML.
# These define the SHAPE + ORDER of slots; we match each detected blob to
# the nearest legacy template point so detected positions inherit the
# right fill-order index.
LEGACY = {
    "mark":  [(-61, 433), (13, 433), (100, 434),
              (-78, 366), (-4, 362), (62, 379),
              (-50, 307), (45, 311), (-1, 261)],
    "seal":  [(-45, 209), (40, 204), (-9, 152),
              (56, 125),  (94, 73),  (162, 41),
              (231, 21),  (307, -1), (340, 58)],
    "glyph": [(387, 2),   (428, 59), (466, 1),
              (519, 49),  (483, 103),(563, 2),
              (621, 42),  (574, 90), (600, 150)],
    "quint": [(-22, 46), (163, 268), (440, 206)],
}

# ---- Phase 1: detect dark connected components ----
img = Image.open(IMG_PATH).convert("RGB")
W, H = img.size
data = img.tobytes()

mask = bytearray(W * H)
for y in range(H):
    base = y * W * 3
    out_base = y * W
    for x in range(W):
        i = base + x * 3
        if (data[i] + data[i+1] + data[i+2]) // 3 < DARK_THRESH:
            mask[out_base + x] = 1

visited = bytearray(W * H)
components = []
for sy in range(H):
    for sx in range(W):
        if mask[sy * W + sx] and not visited[sy * W + sx]:
            stack = [(sx, sy)]
            visited[sy * W + sx] = 1
            pts = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        idx = ny * W + nx
                        if mask[idx] and not visited[idx]:
                            visited[idx] = 1
                            stack.append((nx, ny))
            if MIN_AREA <= len(pts) <= MAX_AREA:
                minx = miny = 99999; maxx = maxy = 0
                rsum = gsum = bsum = 0
                sx_ = sy_ = 0
                for px, py in pts:
                    sx_ += px; sy_ += py
                    if px < minx: minx = px
                    if px > maxx: maxx = px
                    if py < miny: miny = py
                    if py > maxy: maxy = py
                    i = (py * W + px) * 3
                    rsum += data[i]; gsum += data[i+1]; bsum += data[i+2]
                bw = maxx - minx + 1
                bh = maxy - miny + 1
                aspect = bw / bh
                if not (ASPECT_MIN <= aspect <= ASPECT_MAX):
                    continue  # exclude elongated shapes (text, borders)
                n = len(pts)
                components.append({
                    "cx": sx_ / n, "cy": sy_ / n, "area": n,
                    "bw": bw, "bh": bh,
                    "r": rsum / n, "g": gsum / n, "b": bsum / n,
                })

# ---- Phase 2: classify by dominant color channel ----
# Mark = red dominant (R high, B low)
# Seal = yellow (R + G high, B low)
# Glyph = blue (B dominant)
# Quint = bluish-purple (R~B both moderate, G low) — by-elimination
groups = {"mark": [], "seal": [], "glyph": [], "quint": []}
for c in components:
    r, g, b = c["r"], c["g"], c["b"]
    if r > 60 and r > b * 2 and g < 50:
        groups["mark"].append(c)
    elif r > 60 and g > 50 and b < 30:
        groups["seal"].append(c)
    elif b > 50 and b > r + 20:
        groups["glyph"].append(c)
    elif b > 35 and abs(r - b) < 25 and g < r and g < b:
        groups["quint"].append(c)

print(f"\nClassified components:")
for cat, items in groups.items():
    print(f"  {cat}: {len(items)}")

# ---- Phase 3: match each detected component to a legacy template index ----
def transform_legacy_to_detected(legacy_positions, detected):
    lxs = [p[0] for p in legacy_positions]
    lys = [p[1] for p in legacy_positions]
    dxs = [c["cx"] for c in detected]
    dys = [c["cy"] for c in detected]
    lx_min, lx_max = min(lxs), max(lxs)
    ly_min, ly_max = min(lys), max(lys)
    dx_min, dx_max = min(dxs), max(dxs)
    dy_min, dy_max = min(dys), max(dys)
    lw = max(lx_max - lx_min, 1)
    lh = max(ly_max - ly_min, 1)
    dw = dx_max - dx_min
    dh = dy_max - dy_min
    def t(lx, ly):
        return (dx_min + (lx - lx_min) / lw * dw,
                dy_min + (ly - ly_min) / lh * dh)
    return t

def match_in_fill_order(category):
    legacy = LEGACY[category]
    detected = groups[category]
    if len(detected) != len(legacy):
        print(f"  WARNING: {category} expected {len(legacy)} but found {len(detected)}")
    t = transform_legacy_to_detected(legacy, detected)
    used = set()
    matched = []
    for lx, ly in legacy:
        tx, ty = t(lx, ly)
        best_i = None
        best_d = float("inf")
        for i, c in enumerate(detected):
            if i in used: continue
            d = (c["cx"] - tx) ** 2 + (c["cy"] - ty) ** 2
            if d < best_d:
                best_d = d
                best_i = i
        if best_i is not None:
            used.add(best_i)
            matched.append(detected[best_i])
    return matched

ordered = []
for cat in ("mark", "seal", "glyph", "quint"):
    ordered.append((cat, match_in_fill_order(cat)))

# ---- Phase 4: scale to 1024x615 logical coords and emit JS ----
SCALE_X = LOGICAL_W / W
SCALE_Y = LOGICAL_H / H

print(f"\nScale to logical: {SCALE_X:.4f}x by {SCALE_Y:.4f}y (image {W}x{H} -> {LOGICAL_W}x{LOGICAL_H})")

lines = ["var SLOT_LEGACY = ["]
for cat, items in ordered:
    label = {"mark": "Marks — fill order 1, 4, 7, 11, 14, 17, 21, 24, 27",
             "seal": "Seals — fill order 2, 5, 8, 12, 15, 18, 22, 25, 28",
             "glyph": "Glyphs — fill order 3, 6, 9, 13, 16, 19, 23, 26, 29",
             "quint": "Quintessences — fill order 10, 20, 30"}[cat]
    lines.append(f"    // {label}")
    pairs = []
    for c in items:
        lx = round(c["cx"] * SCALE_X)
        ly = round(c["cy"] * SCALE_Y)
        pairs.append(f"[ {lx:>4}, {ly:>4} ]")
    # Print 3 per line for readability
    for i in range(0, len(pairs), 3):
        chunk = ", ".join(pairs[i:i+3])
        suffix = "," if (i + 3 < len(pairs) or cat != "quint") else ""
        lines.append(f"    {chunk}{suffix}")
    lines.append("")
lines.append("];")

print("\n" + "\n".join(lines))

# Save to a file for easy paste-back
out_path = os.path.join(HERE, "detect-indents-output.js")
with open(out_path, "w") as f:
    f.write("\n".join(lines))
print(f"\nAlso written to {out_path}")
