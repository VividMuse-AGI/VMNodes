"""VM MOSS Layout Studio: a bilingual poster/infographic layout workbench.

The node compiles a visual canvas into the two JSON shapes used by MOSS-Image:

* ``layout_prompt`` — model input (``abs_centralized`` + ``yxyx``), identical in
  spirit to ``moss-image-prompt-enhancer/scripts/compile_prompt.py``.
* ``draft_json`` — editable draft (``abs`` + ``xyxy``) that can be pasted back
  into the same Skill or any LLM for another iteration.

Only ComfyUI's bundled ``torch``/``numpy``/``Pillow`` are used.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw, ImageFont

try:  # ComfyUI always ships torch; keep the module importable for tests.
    import torch
except Exception:  # pragma: no cover - headless environments without torch
    torch = None  # type: ignore[assignment]

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None  # type: ignore[assignment]


NODE_ID = "VMMOSSLayoutStudio"
NODE_LABEL = "VM MOSS Layout Studio"

# ---------------------------------------------------------------------------
# Option constants (values are part of the workflow contract: never rename)
# ---------------------------------------------------------------------------

PRESET_CUSTOM = "Custom (自定义宽高 / Custom W×H)"

CANVAS_PRESETS: Dict[str, Optional[Tuple[int, int]]] = {
    PRESET_CUSTOM: None,
    "Poster 3:4 Standard (896x1152)": (896, 1152),
    "Poster 3:4 HD (1152x1536)": (1152, 1536),
    "Poster 2:3 Standard (832x1216)": (832, 1216),
    "Poster 2:3 HD (1024x1536)": (1024, 1536),
    "Mobile 9:16 Standard (768x1344)": (768, 1344),
    "Mobile 9:16 HD (1088x1920)": (1088, 1920),
    "Infographic 1:2 Long (768x1536)": (768, 1536),
    "Infographic 1:2 HD (896x1792)": (896, 1792),
    "Print A4 Portrait (896x1264)": (896, 1264),
    "Print A4 HD (1216x1728)": (1216, 1728),
    "Square 1:1 Standard (1024x1024)": (1024, 1024),
    "Square 1:1 HD (1536x1536)": (1536, 1536),
    "Landscape 4:3 (1152x896)": (1152, 896),
    "Campaign 3:2 HD (1536x1024)": (1536, 1024),
    "Banner 16:9 Standard (1344x768)": (1344, 768),
    "Banner 16:9 HD (1920x1088)": (1920, 1088),
    "Ultrawide 21:9 (1536x640)": (1536, 640),
}
PRESET_NAMES = list(CANVAS_PRESETS)

SYNC_SMART = "Smart (文字/主体保比例，背景铺满)"
SYNC_KEEP = "Keep Box Aspect (所有框保持自身长宽比)"
SYNC_STRETCH = "Stretch with Canvas (随画布比例弹性拉伸)"
SYNC_CENTER = "Center Layout (居中扩展，缩小时整体适配)"
SYNC_MODES = [SYNC_SMART, SYNC_KEEP, SYNC_STRETCH, SYNC_CENTER]

LAYER_AUTO = "Auto (背景->物体->角色->文字置顶)"
LAYER_MANUAL = "Manual (严格按列表手动顺序)"
LAYER_MODES = [LAYER_AUTO, LAYER_MANUAL]

SCENE_META_NONE = "none (不写入 meta)"
SCENE_META = [
    "poster",
    "infographic",
    "product campaign",
    "editorial",
    "comic",
    "illustration",
    "photography",
    "ui_design",
    SCENE_META_NONE,
]

CANVAS_TYPES = ["single", "multi_panel", "collage"]

EXTERNAL_IGNORE = "Ignore (仅使用画布)"
EXTERNAL_REPLACE = "Replace Canvas (用外部 JSON 覆盖画布并回填)"
EXTERNAL_MERGE = "Merge into Canvas (追加到当前画布并回填)"
EXTERNAL_MODES = [EXTERNAL_IGNORE, EXTERNAL_REPLACE, EXTERNAL_MERGE]

UI_LANGUAGES = ["中文 (ZH)", "English (EN)"]

VALID_LABELS = ("object", "character", "text")
LABEL_ORDER = {"object": 0, "character": 1, "text": 2}
LABEL_TAG = {"object": "O", "character": "C", "text": "T"}
LABEL_COLOR = {
    "object": (74, 144, 255),
    "character": (53, 196, 106),
    "text": (255, 159, 67),
}

MIN_BOX_PIXELS = 8
LARGE_BG_AREA = 0.70
PREVIEW_LONG_EDGE = 1152
THUMB_LONG_EDGE = 512
ALIGN = 16
MIN_SIDE, MAX_SIDE = 256, 4096

# V2.1 palette: the preview paints summary.palette / item.palette swatches, so
# colour strings (hex or common English words) must resolve to RGB here.
COLOR_NAMES = {
    "white": (255, 255, 255), "black": (0, 0, 0), "ivory": (255, 255, 240),
    "cream": (255, 253, 208), "gold": (255, 215, 0), "silver": (192, 192, 192),
    "gray": (128, 128, 128), "grey": (128, 128, 128), "red": (255, 0, 0),
    "crimson": (220, 20, 60), "maroon": (128, 0, 0), "pink": (255, 192, 203),
    "orange": (255, 165, 0), "coral": (255, 127, 80), "yellow": (255, 255, 0),
    "lime": (0, 255, 0), "green": (0, 128, 0), "emerald": (80, 200, 120),
    "mint": (152, 255, 152), "teal": (0, 128, 128), "cyan": (0, 255, 255),
    "skyblue": (135, 206, 235), "blue": (0, 0, 255), "navy": (0, 0, 128),
    "purple": (128, 0, 128), "violet": (138, 43, 226), "lavender": (230, 230, 250),
    "magenta": (255, 0, 255), "brown": (165, 42, 42), "beige": (245, 245, 220),
    "charcoal": (54, 69, 79), "slate": (112, 128, 144), "sand": (232, 220, 196),
    "amber": (255, 191, 0), "bronze": (205, 127, 50),
}
_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _clampf(value: float, low: float, high: float) -> float:
    return low if value < low else (high if value > high else value)


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(out) or math.isinf(out):
        return default
    return out


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _normalize_label(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in ("text", "font", "title", "文字"):
        return "text"
    if text in ("character", "char", "person", "角色", "人物"):
        return "character"
    return "object"


def align16(value: Any, default: int = 1024) -> int:
    """Clamp to 256–4096 and snap to the nearest multiple of 16 (G03)."""
    size = _as_int(value, default)
    size = max(MIN_SIDE, min(MAX_SIDE, size))
    return int(round(size / float(ALIGN))) * ALIGN


def parse_color(value: Any) -> Optional[Tuple[int, int, int]]:
    """Resolve `#abc` / `#AABBCC` / common colour words to RGB; else None."""
    text = str(value or "").strip()
    if not text:
        return None
    match = _HEX_RE.match(text)
    if match:
        digits = match.group(1)
        if len(digits) == 3:
            digits = "".join(ch * 2 for ch in digits)
        return (int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16))
    return COLOR_NAMES.get(re.sub(r"[\s_-]+", "", text.lower()))


def _draw_palette_dots(draw: ImageDraw.ImageDraw, colors: Sequence[Any],
                       x: float, y: float, size: int, gap: int,
                       border: Tuple[int, int, int, int], limit: int = 4) -> float:
    """Paint up to `limit` swatches starting at `x`; returns the right edge."""
    cursor = x
    drawn = 0
    for color in list(colors)[:limit]:
        rgb = parse_color(color)
        if rgb is not None:
            draw.rectangle([cursor, y, cursor + size, y + size], fill=rgb + (255,), outline=border, width=1)
            drawn += 1
        cursor += size + gap
    return max(x, cursor - gap) if drawn else x


def _split_tags(*values: Any) -> List[str]:
    tags: List[str] = []
    for value in values:
        if isinstance(value, (list, tuple)):
            parts = [str(v) for v in value]
        else:
            parts = re.split(r"[,，;；\n]+", str(value or ""))
        for part in parts:
            tag = part.strip()
            if tag and tag.lower() not in (t.lower() for t in tags):
                tags.append(tag)
    return tags


# ---------------------------------------------------------------------------
# Aspect synchronisation (shared by canvas resizing and cross-size imports)
# ---------------------------------------------------------------------------


def sync_box_aspect_ratio(
    box: Dict[str, Any], W0: int, H0: int, W1: int, H1: int, mode: str
) -> Tuple[float, float, float, float]:
    """Return normalised ``(cx, cy, w, h)`` for a box moved from W0×H0 to W1×H1."""
    cx, cy, w, h = (
        _as_float(box.get("cx"), 0.5),
        _as_float(box.get("cy"), 0.5),
        _as_float(box.get("w"), 0.0),
        _as_float(box.get("h"), 0.0),
    )
    if W0 <= 0 or H0 <= 0 or W1 <= 0 or H1 <= 0 or (W0 == W1 and H0 == H1):
        return cx, cy, w, h
    if w <= 0 or h <= 0:
        return cx, cy, w, h

    if mode == SYNC_CENTER:
        if (box.get("label") == "object" and w >= 0.98 and h >= 0.98
                and abs(cx - 0.5) <= 0.01 and abs(cy - 0.5) <= 0.01):
            return 0.5, 0.5, 1.0, 1.0
        scale = min(1.0, W1 / W0, H1 / H0)
        return (0.5 + (cx - 0.5) * W0 * scale / W1,
                0.5 + (cy - 0.5) * H0 * scale / H1,
                w * W0 * scale / W1, h * H0 * scale / H1)

    is_large_bg = box.get("label") == "object" and (w * h) >= LARGE_BG_AREA
    if mode == SYNC_STRETCH and not box.get("lock_aspect", False):
        keep_aspect = False
    elif mode == SYNC_KEEP or box.get("lock_aspect", False):
        keep_aspect = True
    else:
        keep_aspect = not is_large_bg
    if not keep_aspect:
        return cx, cy, w, h

    r_box = _as_float(box.get("orig_aspect"), 0.0)
    if r_box <= 0:
        r_box = (w * W0) / max(h * H0, 1e-6)
    target_norm_ratio = r_box * (H1 / W1)

    area_norm = w * h
    w_new = math.sqrt(max(area_norm, 1e-12) * target_norm_ratio)
    h_new = math.sqrt(max(area_norm, 1e-12) / max(target_norm_ratio, 1e-6))
    scale_down = min(1.0, 0.98 / max(w_new, 1e-6), 0.98 / max(h_new, 1e-6))
    w_new *= scale_down
    h_new *= scale_down

    cx_new = min(max(cx, w_new / 2.0), 1.0 - w_new / 2.0)
    cy_new = min(max(cy, h_new / 2.0), 1.0 - h_new / 2.0)
    return cx_new, cy_new, w_new, h_new


def valid_reference_size(value: Any) -> bool:
    return (isinstance(value, (list, tuple)) and len(value) == 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool)
                    and math.isfinite(v) and v > 0 for v in value))


def sync_reference_size(state: Dict[str, Any], W: int, H: int, mode: str) -> None:
    if mode != SYNC_CENTER:
        state.pop("reference_size", None)
        return
    size = state.get("reference_size")
    if not valid_reference_size(size):
        size = [state["base_width"], state["base_height"]]
    scale = min(1.0, W / state["base_width"], H / state["base_height"])
    state["reference_size"] = [v * scale for v in size]


def sync_boxes(
    boxes: Sequence[Dict[str, Any]], W0: int, H0: int, W1: int, H1: int, mode: str
) -> List[Dict[str, Any]]:
    out = []
    for box in boxes:
        cx, cy, w, h = sync_box_aspect_ratio(box, W0, H0, W1, H1, mode)
        moved = dict(box)
        moved.update(cx=cx, cy=cy, w=w, h=h)
        out.append(moved)
    return out


# ---------------------------------------------------------------------------
# Layout state (layout_data)
# ---------------------------------------------------------------------------


def empty_state(width: int, height: int) -> Dict[str, Any]:
    return {"version": 2, "base_width": int(width), "base_height": int(height), "boxes": []}


def normalize_box(raw: Dict[str, Any], index: int, W0: int, H0: int) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    w = abs(_clampf(_as_float(raw.get("w"), 0.0), 0.0, 1.0))
    h = abs(_clampf(_as_float(raw.get("h"), 0.0), 0.0, 1.0))
    if w <= 1e-6 or h <= 1e-6:
        return None
    label = _normalize_label(raw.get("label"))
    aspect = _as_float(raw.get("orig_aspect"), 0.0)
    if aspect <= 0:
        aspect = (w * max(W0, 1)) / max(h * max(H0, 1), 1e-6)
    box_id = str(raw.get("id") or f"box_{index + 1}")
    return {
        "id": box_id,
        "label": label,
        "visible": bool(raw.get("visible", True)),
        "lock_aspect": bool(raw.get("lock_aspect", label != "object")),
        "cx": _clampf(_as_float(raw.get("cx"), 0.5), 0.0, 1.0),
        "cy": _clampf(_as_float(raw.get("cy"), 0.5), 0.0, 1.0),
        "w": w,
        "h": h,
        "orig_aspect": float(aspect),
        "text": str(raw.get("text") or ""),
        "caption": str(raw.get("caption") or ""),
        "tags": _split_tags(raw.get("tags")) if raw.get("tags") is not None else [],
        "palette": _split_tags(raw.get("palette")) if raw.get("palette") is not None else [],
    }


def parse_layout_data(raw: Any, width: int, height: int) -> Dict[str, Any]:
    if isinstance(raw, dict):
        data = raw
    else:
        text = str(raw or "").strip()
        if not text:
            return empty_state(width, height)
        try:
            data = json.loads(text)
        except (TypeError, ValueError):
            print(f"[{NODE_ID}] layout_data 不是合法 JSON，按空画布处理。")
            return empty_state(width, height)
    if not isinstance(data, dict):
        return empty_state(width, height)

    base_w = _as_int(data.get("base_width"), width) or width
    base_h = _as_int(data.get("base_height"), height) or height
    if base_w <= 0 or base_h <= 0:
        base_w, base_h = width, height

    boxes: List[Dict[str, Any]] = []
    seen = set()
    for index, raw_box in enumerate(data.get("boxes") or []):
        box = normalize_box(raw_box, index, base_w, base_h)
        if box is None:
            continue
        if box["id"] in seen:
            box["id"] = f"{box['id']}_{index}"
        seen.add(box["id"])
        boxes.append(box)

    state: Dict[str, Any] = {
        "version": 2,
        "base_width": int(base_w),
        "base_height": int(base_h),
        "boxes": boxes,
    }
    if valid_reference_size(data.get("reference_size")):
        state["reference_size"] = list(data["reference_size"])
    # Import transport fields (they let the frontend restore widgets after onExecuted).
    for key in ("caption", "canvas"):
        if key in data and data[key] is not None:
            state[key] = data[key]
    # meta / palette are always normalised to a de-duplicated list of strings so a
    # hand-edited layout_data cannot leak a bare string into summary.palette.
    for key in ("meta", "palette"):
        if key in data and data[key] is not None:
            state[key] = _split_tags(data[key])
    return state


def display_tags(boxes: Sequence[Dict[str, Any]]) -> Dict[str, str]:
    """Stable labels (T1/C1/O1) assigned in list order, independent of z-sorting."""
    counters = {"object": 0, "character": 0, "text": 0}
    tags: Dict[str, str] = {}
    for box in boxes:
        label = box["label"]
        counters[label] += 1
        tags[box["id"]] = f"{LABEL_TAG[label]}{counters[label]}"
    return tags


def effective_boxes(boxes: Sequence[Dict[str, Any]], mode: str, visible_only: bool = False) -> List[Dict[str, Any]]:
    """Single source of truth for draw order, hit-testing and compilation (F05)."""
    items = list(boxes)
    if visible_only:
        items = [b for b in items if b.get("visible", True)]
    if mode == LAYER_MANUAL:
        return items
    return sorted(
        items,
        key=lambda b: (LABEL_ORDER.get(b["label"], 0), -(b["w"] * b["h"])),
    )


def _quantize(value: float) -> int:
    """Deterministic 0.001 quantization shared with the frontend (half-up)."""
    return int(math.floor(_as_float(value) * 1000.0 + 0.5))


def _content_id(label: str, caption: str, text: str, bbox: Sequence[float]) -> str:
    seed = "|".join([label, caption, text, ",".join(str(_quantize(v)) for v in bbox)])
    return f"imp_{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:10]}"


# ---------------------------------------------------------------------------
# Skill JSON parsing (draft abs/xyxy, compiled abs_centralized/yxyx, caption)
# ---------------------------------------------------------------------------


FENCE = re.compile(r"^\s*```(?:json|JSON)?\s*\n?(.*?)\n?\s*```\s*$", re.S)


def strip_fences(raw: Any) -> str:
    text = str(raw or "").strip()
    match = FENCE.match(text)
    if match:
        text = match.group(1).strip()
    return text


def _json_object(text: str) -> Optional[dict]:
    if not text:
        return None
    try:
        value = json.loads(text)
    except (TypeError, ValueError):
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            value = json.loads(text[start:end + 1])
        except (TypeError, ValueError):
            return None
    return value if isinstance(value, dict) else None


def parse_skill_json(
    raw: Any, dst_w: int, dst_h: int, mode: str = SYNC_SMART
) -> Optional[Dict[str, Any]]:
    """Parse a Skill draft/compiled prompt/caption into canvas boxes.

    Returns ``None`` when the text is not recognised as layout JSON. A plain
    caption string (or ``{"caption": ...}``) returns ``boxes=[]`` plus caption.
    """
    text = strip_fences(raw)
    if not text:
        return None
    data = _json_object(text)
    if data is None:
        if text.startswith("{"):
            return None
        return {"kind": "caption", "caption": text, "boxes": [], "width": dst_w, "height": dst_h}

    if "items" not in data:
        caption = str(data.get("caption") or "").strip()
        if caption and set(data) <= {"caption"}:
            return {"kind": "caption", "caption": caption, "boxes": [],
                    "width": dst_w, "height": dst_h}
        return None

    if not isinstance(data["items"], list):
        return None

    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    space = str(data.get("bbox_coord_space") or "abs").lower()
    fmt = str(data.get("bbox_format") or "xyxy").lower()
    src_w = align16(data.get("width", dst_w), dst_w)
    src_h = align16(data.get("height", dst_h), dst_h)
    compiled = space in ("abs_centralized", "absolute_centralized") or fmt == "yxyx"

    caption = str(summary.get("caption") or data.get("caption") or "").strip()
    meta = _split_tags(summary.get("meta")) if summary.get("meta") is not None else []
    palette = _split_tags(summary.get("palette")) if summary.get("palette") is not None else []
    canvas = str(summary.get("canvas") or "").strip() or None

    boxes: List[Dict[str, Any]] = []
    seen = set()
    for index, item in enumerate(data.get("items") or []):
        if not isinstance(item, dict):
            continue
        bbox = item.get("bbox")
        if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
            continue
        values = [_as_float(v) for v in bbox]
        if compiled:
            ymin, xmin, ymax, xmax = values
            if ((data.get("width") is None and max(abs(xmin), abs(xmax)) > src_w / 2.0)
                    or (data.get("height") is None and max(abs(ymin), abs(ymax)) > src_h / 2.0)):
                raise ValueError("Compiled JSON 缺少源尺寸且坐标超出当前画布；请补充 width/height 或选择正确画布。 "
                                 "Compiled JSON exceeds the canvas without source dimensions; "
                                 "provide width/height or select the correct canvas.")
            x1, y1 = xmin + src_w / 2.0, ymin + src_h / 2.0
            x2, y2 = xmax + src_w / 2.0, ymax + src_h / 2.0
        else:
            # Draft coordinates are top-left based; tolerate a swapped pair.
            x1, y1, x2, y2 = values
        x1, x2 = sorted((x1, x2))
        y1, y2 = sorted((y1, y2))
        w_px, h_px = x2 - x1, y2 - y1
        if w_px <= 0 or h_px <= 0:
            continue
        label = _normalize_label(item.get("label"))
        box = {
            "label": label,
            "visible": True,
            "lock_aspect": label != "object",
            "cx": ((x1 + x2) / 2.0) / src_w,
            "cy": ((y1 + y2) / 2.0) / src_h,
            "w": w_px / src_w,
            "h": h_px / src_h,
            "orig_aspect": w_px / max(h_px, 1e-6),
            "text": str(item.get("text") or ""),
            "caption": str(item.get("caption") or ""),
            "tags": _split_tags(item.get("tags")) if item.get("tags") is not None else [],
            "palette": _split_tags(item.get("palette")) if item.get("palette") is not None else [],
        }
        box["id"] = _content_id(label, box["caption"], box["text"],
                                [box["cx"], box["cy"], box["w"], box["h"]])
        if box["id"] in seen:
            box["id"] = f"{box['id']}_{index}"
        seen.add(box["id"])
        # F02: preserve the physical aspect recorded in the source canvas.
        if (src_w, src_h) != (dst_w, dst_h):
            cx, cy, w, h = sync_box_aspect_ratio(box, src_w, src_h, dst_w, dst_h, mode)
            box.update(cx=cx, cy=cy, w=w, h=h)
        boxes.append(box)

    # Only an explicit empty items list means "clear the layout". A nonempty
    # list with no usable geometry is invalid even when it includes a caption.
    if data["items"] and not boxes:
        return None
    return {
        "kind": "compiled" if compiled else "draft",
        "width": src_w,
        "height": src_h,
        "caption": caption,
        "meta": meta,
        "palette": palette,
        "canvas": canvas,
        "boxes": boxes,
    }


def merge_boxes(current: Sequence[Dict[str, Any]], incoming: Sequence[Dict[str, Any]], replace: bool) -> List[Dict[str, Any]]:
    """Merge by deterministic id so repeated runs never duplicate boxes (F01)."""
    if replace:
        return [dict(box) for box in incoming]
    merged = {box["id"]: dict(box) for box in current}
    for box in incoming:
        merged[box["id"]] = dict(box)
    return list(merged.values())


# ---------------------------------------------------------------------------
# Compilation
# ---------------------------------------------------------------------------


def _round_edges(box: Dict[str, Any], W: int, H: int) -> Optional[Tuple[List[int], List[float]]]:
    """Return (abs_centralized yxyx, top-left xyxy) or None for degenerate boxes."""
    x1 = (box["cx"] - box["w"] / 2.0) * W
    x2 = (box["cx"] + box["w"] / 2.0) * W
    y1 = (box["cy"] - box["h"] / 2.0) * H
    y2 = (box["cy"] + box["h"] / 2.0) * H
    x1, x2 = sorted((x1, x2))
    y1, y2 = sorted((y1, y2))
    x1, y1 = max(0.0, x1), max(0.0, y1)
    x2, y2 = min(float(W), x2), min(float(H), y2)
    if x2 - x1 < MIN_BOX_PIXELS or y2 - y1 < MIN_BOX_PIXELS:
        return None
    # Official compile_prompt.py: enclose fractional edges, then centre.
    ymin = math.floor(round(y1, 9)) - H // 2
    xmin = math.floor(round(x1, 9)) - W // 2
    ymax = math.ceil(round(y2, 9)) - H // 2
    xmax = math.ceil(round(x2, 9)) - W // 2
    if ymin >= ymax or xmin >= xmax:
        return None
    return [int(ymin), int(xmin), int(ymax), int(xmax)], [x1, y1, x2, y2]


def default_text_caption(text: str, box: Dict[str, Any], W: int, H: int, zh: bool) -> str:
    cy = _as_float(box.get("cy"), 0.5)
    aspect = (box["w"] * W) / max(box["h"] * H, 1e-6)
    if zh:
        zone = "画面上方的主标题" if cy <= 0.22 else "上部副标题" if cy <= 0.42 else \
            "画面中心的主标题" if cy <= 0.62 else "下部辅助文字" if cy <= 0.8 else "底部落款文字"
        shape = "单行横向横幅" if aspect >= 6 else "单行标签" if aspect >= 3 else "紧凑多行文本块"
        return f'清晰可读的排版，渲染文字 "{text}"，位于{zone}，{shape}。'
    zone = "headline at the top of the canvas" if cy <= 0.22 else \
        "upper sub-headline" if cy <= 0.42 else "centered headline" if cy <= 0.62 else \
        "lower supporting text" if cy <= 0.8 else "footer text at the bottom"
    shape = "single-line wide banner" if aspect >= 6 else \
        "one-line label" if aspect >= 3 else "compact multi-line text block"
    return f'Clear, legible typography rendering the text "{text}" — {zone}, {shape}'


def build_items(
    boxes: Sequence[Dict[str, Any]], W: int, H: int, zh: bool
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Compiled items (yxyx) and draft items (xyxy), in the same effective order."""
    compiled: List[Dict[str, Any]] = []
    draft: List[Dict[str, Any]] = []
    for box in boxes:
        if not box.get("visible", True):
            continue
        rounded = _round_edges(box, W, H)
        if rounded is None:
            continue
        yxyx, xyxy = rounded
        label = box["label"]
        text = str(box.get("text") or "").strip()
        caption = str(box.get("caption") or "").strip()
        if not caption:
            caption = default_text_caption(text, box, W, H, zh) if label == "text" and text else \
                ("清晰可读的排版。" if zh else "Clear, legible typography.") if label == "text" else \
                (f"一个轮廓清晰的 {label} 区域。" if zh else f"A clearly defined {label} region.")
        item: Dict[str, Any] = {"label": label, "caption": caption}
        if label == "text":
            item["text"] = text
        item["bbox"] = yxyx
        if box.get("tags"):
            item["tags"] = list(box["tags"])
        if box.get("palette"):
            item["palette"] = list(box["palette"])
        compiled.append(item)

        draft_item: Dict[str, Any] = {"label": label, "caption": caption,
                                      "bbox": [round(v, 9) for v in xyxy]}
        if label == "text":
            draft_item["text"] = text
        if box.get("tags"):
            draft_item["tags"] = list(box["tags"])
        if box.get("palette"):
            draft_item["palette"] = list(box["palette"])
        draft.append(draft_item)
    return compiled, draft


def build_layout_prompt(items: Sequence[Dict[str, Any]], meta: Sequence[str],
                        canvas: str, caption: str, palette: Sequence[str] = ()) -> str:
    summary: Dict[str, Any] = {}
    if meta:
        summary["meta"] = list(meta)
    if canvas:
        summary["canvas"] = canvas
    summary["caption"] = caption
    if palette:
        summary["palette"] = list(palette)
    payload = {
        "summary": summary,
        "items": list(items),
        "bbox_coord_space": "abs_centralized",
        "bbox_format": "yxyx",
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def build_draft_json(items: Sequence[Dict[str, Any]], meta: Sequence[str], canvas: str,
                     caption: str, palette: Sequence[str], W: int, H: int) -> str:
    summary: Dict[str, Any] = {}
    if meta:
        summary["meta"] = list(meta)
    if canvas:
        summary["canvas"] = canvas
    summary["caption"] = caption
    if palette:
        summary["palette"] = list(palette)
    payload = {
        "width": int(W),
        "height": int(H),
        "bbox_coord_space": "abs",
        "bbox_format": "xyxy",
        "summary": summary,
        "items": list(items),
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------

_FONT_CANDIDATES = (
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/simsun.ttc",
    "C:/Windows/Fonts/Deng.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/PingFang.ttc",
)


@lru_cache(maxsize=64)
def _font(size: int, bold: bool = False):
    size = max(8, int(size))
    candidates = tuple(reversed(_FONT_CANDIDATES)) if bold else _FONT_CANDIDATES
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size)
    except Exception:  # Pillow < 10.1
        return ImageFont.load_default()


def _tensor_to_pil(image: Any) -> Optional[Image.Image]:
    try:
        if image is None:
            return None
        frame = image
        if hasattr(frame, "dim") and frame.dim() == 4:
            frame = frame[0]
        arr = frame.detach().cpu().numpy() if hasattr(frame, "detach") else frame
        if np is not None:
            arr = np.asarray(arr)
        arr = (arr * 255.0).clip(0, 255).astype("uint8")
        return Image.fromarray(arr).convert("RGB")
    except Exception:
        return None


def _pil_to_tensor(img: Image.Image) -> Any:
    arr = np.asarray(img.convert("RGB"), dtype="float32") / 255.0 if np is not None else None
    if torch is None:
        return arr[None, ...] if arr is not None else None
    if arr is None:
        return torch.zeros((1, img.height, img.width, 3), dtype=torch.float32)
    return torch.from_numpy(arr)[None, ...]


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: float, max_lines: int) -> List[str]:
    if not text or max_w <= 8:
        return []
    lines: List[str] = []
    for para in str(text).split("\n"):
        line = ""
        for chunk in para.split(" "):
            trial = chunk if not line else f"{line} {chunk}"
            if line and draw.textlength(trial, font=font) > max_w:
                lines.append(line)
                line = chunk
            else:
                line = trial
            while draw.textlength(line, font=font) > max_w and len(line) > 1:
                cut = len(line) - 1
                while cut > 1 and draw.textlength(line[:cut], font=font) > max_w:
                    cut -= 1
                lines.append(line[:cut])
                line = line[cut:]
            if len(lines) >= max_lines:
                return lines[:max_lines]
        lines.append(line)
        if len(lines) >= max_lines:
            return lines[:max_lines]
    return [line for line in lines[:max_lines] if line]


def render_preview(boxes: Sequence[Dict[str, Any]], W: int, H: int,
                   ref_image: Any = None, tags: Optional[Dict[str, str]] = None,
                   palette: Sequence[Any] = (), reference_size=None) -> Image.Image:
    scale = min(1.0, PREVIEW_LONG_EDGE / float(max(W, H) or 1))
    pw, ph = max(1, int(round(W * scale))), max(1, int(round(H * scale)))
    tags = tags or display_tags(boxes)

    bg = _tensor_to_pil(ref_image)
    if bg is not None:
        if valid_reference_size(reference_size):
            rw, rh = max(1, round(reference_size[0] * pw / W)), max(1, round(reference_size[1] * ph / H))
            base = Image.new("RGB", (pw, ph), (20, 20, 25))
            image = bg.resize((rw, rh), Image.LANCZOS)
            image = Image.blend(image, Image.new("RGB", (rw, rh), (0, 0, 0)), 0.55)
            base.paste(image, ((pw - rw) // 2, (ph - rh) // 2))
        else:
            base = Image.blend(bg.resize((pw, ph), Image.LANCZOS),
                               Image.new("RGB", (pw, ph), (0, 0, 0)), 0.55)
    else:
        base = Image.new("RGB", (pw, ph), (20, 20, 25))
        draw_bg = ImageDraw.Draw(base)
        step = max(32, pw // 16)
        for gy in range(0, ph, step):
            for gx in range(0, pw, step):
                if ((gx // step) + (gy // step)) % 2 == 0:
                    draw_bg.rectangle([gx, gy, gx + step, gy + step], fill=(26, 26, 32))

    overlay = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for i in (1, 2):
        x, y = round(pw * i / 3.0), round(ph * i / 3.0)
        draw.line([(x, 0), (x, ph)], fill=(255, 255, 255, 26), width=1)
        draw.line([(0, y), (pw, y)], fill=(255, 255, 255, 26), width=1)

    margin = 0.05
    mx, my = round(pw * margin), round(ph * margin)
    dash = max(4, pw // 80)
    for x in range(mx, pw - mx, dash * 2):
        draw.line([(x, my), (min(x + dash, pw - mx), my)], fill=(255, 255, 255, 60), width=1)
        draw.line([(x, ph - my), (min(x + dash, pw - mx), ph - my)], fill=(255, 255, 255, 60), width=1)
    for y in range(my, ph - my, dash * 2):
        draw.line([(mx, y), (mx, min(y + dash, ph - my))], fill=(255, 255, 255, 60), width=1)
        draw.line([(pw - mx, y), (pw - mx, min(y + dash, ph - my))], fill=(255, 255, 255, 60), width=1)

    title_font = _font(max(11, round(ph / 46)), bold=True)
    body_font = _font(max(10, round(ph / 58)))
    tag_font = _font(max(10, round(ph / 54)), bold=True)

    for z, box in enumerate(boxes, start=1):
        if not box.get("visible", True):
            continue
        color = LABEL_COLOR[box["label"]]
        tag = tags.get(box["id"], "")
        x1 = round((box["cx"] - box["w"] / 2.0) * pw)
        y1 = round((box["cy"] - box["h"] / 2.0) * ph)
        x2 = round((box["cx"] + box["w"] / 2.0) * pw)
        y2 = round((box["cy"] + box["h"] / 2.0) * ph)
        x1, x2 = sorted((max(0, min(pw, x1)), max(0, min(pw, x2))))
        y1, y2 = sorted((max(0, min(ph, y1)), max(0, min(ph, y2))))
        if x2 - x1 < 2 or y2 - y1 < 2:
            continue

        draw.rectangle([x1, y1, x2, y2], fill=color + (36,))
        draw.rectangle([x1, y1, x2, y2], outline=color + (255,), width=max(2, round(ph / 380)))

        chip = f"{tag}  z{z}"
        if box.get("lock_aspect"):
            chip += "  [L]"
        tw = draw.textlength(chip, font=tag_font)
        chip_h = max(14, round(ph / 40))
        draw.rectangle([x1, y1, x1 + tw + 10, y1 + chip_h], fill=color + (235,))
        draw.text((x1 + 5, y1 + (chip_h - tag_font.size) / 2 - 1), chip,
                  fill=(12, 12, 16, 255), font=tag_font)

        if box.get("palette"):
            # Per-box swatches sit right of the tag chip (V2.1 §3).
            dot = max(6, round(ph / 90))
            _draw_palette_dots(draw, box["palette"], x1 + tw + 14,
                               y1 + max(1, (chip_h - dot) // 2), dot, max(2, dot // 3),
                               (10, 10, 14, 230))

        body = box.get("text") if box["label"] == "text" else ""
        body = f'"{body}"' if body else (box.get("caption") or "")
        lines = _wrap(draw, body, body_font, (x2 - x1) - 12, 4)
        ty = y1 + chip_h + 4
        for line in lines:
            if ty + body_font.size > y2:
                break
            draw.text((x1 + 6, ty), line, fill=(240, 240, 248, 255), font=body_font)
            ty += body_font.size + 3

        if (x2 - x1) > 90 and (y2 - y1) > 40:
            label = f"{(x2 - x1) * W / pw:.0f}×{(y2 - y1) * H / ph:.0f}px"
            lw = draw.textlength(label, font=body_font)
            draw.text((x2 - lw - 6, y2 - body_font.size - 3), label,
                      fill=(200, 200, 215, 210), font=body_font)

    info = f"{W}×{H}  ·  {len([b for b in boxes if b.get('visible', True)])} boxes"
    iw = draw.textlength(info, font=title_font)
    bar_h = max(20, round(ph / 34))
    draw.rectangle([0, ph - bar_h, iw + 16, ph], fill=(0, 0, 0, 150))
    draw.text((8, ph - bar_h + 3), info, fill=(235, 235, 245, 255), font=title_font)

    swatches = [color for color in list(palette or [])[:8] if parse_color(color)]
    if swatches:
        # Global swatches are right-aligned inside the bottom status bar.
        dot = max(9, round(bar_h * 0.52))
        gap = max(3, dot // 3)
        total = len(swatches) * (dot + gap) - gap
        _draw_palette_dots(draw, swatches, max(2, pw - 8 - total),
                           ph - bar_h + (bar_h - dot) / 2.0, dot, gap,
                           (245, 245, 250, 235), limit=8)

    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def _thumbnail(image: Any) -> Optional[str]:
    pil = _tensor_to_pil(image)
    if pil is None:
        return None
    w, h = pil.size
    scale = min(1.0, THUMB_LONG_EDGE / float(max(w, h) or 1))
    if scale < 1.0:
        pil = pil.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    buffer = io.BytesIO()
    pil.save(buffer, format="JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------


class VMMOSSLayoutStudio:
    SEARCH_ALIASES = ["VMNodes", "MOSS", "MOSS Layout", "layout", "poster", "infographic",
                      "VM MOSS 海报布局工作台", "海报布局", "信息图", "排版", "布局"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ui_language": (UI_LANGUAGES, {"default": "中文 (ZH)"}),
                "canvas_preset": (PRESET_NAMES, {"default": "Poster 3:4 Standard (896x1152)"}),
                "width": ("INT", {"default": 896, "min": MIN_SIDE, "max": MAX_SIDE, "step": ALIGN}),
                "height": ("INT", {"default": 1152, "min": MIN_SIDE, "max": MAX_SIDE, "step": ALIGN}),
                "bbox_ratio_sync": (SYNC_MODES, {"default": SYNC_SMART}),
                "scene_meta": (SCENE_META, {"default": "poster"}),
                "canvas_layout_type": (CANVAS_TYPES, {"default": "single"}),
                "layer_order_mode": (LAYER_MODES, {"default": LAYER_AUTO}),
                "global_prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "整体画面、背景、光影与排版风格描述 (summary.caption)...",
                }),
                "layout_data": ("STRING", {"default": "{}", "multiline": False}),
            },
            "optional": {
                "ref_image": ("IMAGE",),
                "external_layout_json": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Draft JSON (abs/xyxy) or compiled JSON (abs_centralized/yxyx) "
                               "from the moss-image-prompt-enhancer Skill or an LLM.",
                }),
                "external_sync_mode": (EXTERNAL_MODES, {"default": EXTERNAL_REPLACE}),
                "custom_meta_tags": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "Extra medium/genre tags, comma separated; merged into summary.meta.",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "IMAGE", "INT", "INT")
    RETURN_NAMES = ("layout_prompt", "draft_json", "preview_image", "width", "height")
    FUNCTION = "compile_layout"
    CATEGORY = "VMNodes/MOSS"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Bilingual MOSS-Image poster/infographic workbench: draw boxes on a canvas, import or "
        "export Skill JSON, and get layout_prompt (abs_centralized/yxyx) plus an editable "
        "draft_json (abs/xyxy)."
    )

    # -- helpers --------------------------------------------------------

    @staticmethod
    def resolve_canvas(canvas_preset: str, width: Any, height: Any,
                       imported_size: Optional[Tuple[int, int]]) -> Tuple[int, int]:
        """Resolve the effective canvas, always 16-aligned.

        Order: an imported Replace canvas wins (that is what "replace" means),
        then a preset while the size widgets still agree with it (or are
        untouched), then the explicit width/height. A linked width/height that
        differs from both therefore drives the canvas (F04/G03).
        """
        if imported_size is not None:
            return align16(imported_size[0]), align16(imported_size[1])
        aligned = (align16(width), align16(height))
        dims = CANVAS_PRESETS.get(canvas_preset)
        if dims is not None:
            dims = (align16(dims[0]), align16(dims[1]))
            if aligned == dims or aligned == (896, 1152):
                return dims
        return aligned

    # -- main -----------------------------------------------------------

    def compile_layout(self, ui_language, canvas_preset, width, height, bbox_ratio_sync,
                       scene_meta, canvas_layout_type, layer_order_mode, global_prompt,
                       layout_data, ref_image=None, external_layout_json=None,
                       external_sync_mode=EXTERNAL_REPLACE, custom_meta_tags=""):
        mode = bbox_ratio_sync if bbox_ratio_sync in SYNC_MODES else SYNC_SMART
        order_mode = layer_order_mode if layer_order_mode in LAYER_MODES else LAYER_AUTO
        canvas_type = canvas_layout_type if canvas_layout_type in CANVAS_TYPES else "single"
        zh = str(ui_language).startswith("中文")
        external_mode = external_sync_mode if external_sync_mode in EXTERNAL_MODES else EXTERNAL_IGNORE

        # 1) External Skill JSON (parsed before sizing so Replace may adopt its canvas).
        imported: Optional[Dict[str, Any]] = None
        external_text = strip_fences(external_layout_json)
        if external_text and external_mode != EXTERNAL_IGNORE:
            current_w, current_h = self.resolve_canvas(canvas_preset, width, height, None)
            parsed = parse_skill_json(external_text, current_w, current_h, mode)
            if parsed is None:
                print(f"[{NODE_ID}] external_layout_json 无法识别为布局 JSON，已忽略。")
            else:
                imported = parsed

        replace_import = bool(imported and imported["kind"] != "caption"
                              and external_mode == EXTERNAL_REPLACE)
        imported_size = (imported["width"], imported["height"]) if replace_import else None
        W, H = self.resolve_canvas(canvas_preset, width, height, imported_size)

        # 2) Canvas state, aligned to the resolved canvas.
        state = parse_layout_data(layout_data, W, H)
        boxes = state["boxes"]
        if (state["base_width"], state["base_height"]) != (W, H):
            sync_reference_size(state, W, H, mode)
            boxes = sync_boxes(boxes, state["base_width"], state["base_height"], W, H, mode)
        state["base_width"], state["base_height"] = W, H

        synced = False
        caption = str(global_prompt or "").strip()
        meta = _split_tags() if scene_meta == SCENE_META_NONE else _split_tags(scene_meta)
        meta = _split_tags(meta, custom_meta_tags)

        # 3) Apply the external layout to the editable canvas (F01 / F02).
        if imported is not None:
            if imported["kind"] != "caption":
                # Resolve geometry against the final canvas for both import modes.
                imported = parse_skill_json(external_text, W, H, mode) or imported
                boxes = merge_boxes(boxes, imported["boxes"], replace=replace_import)
                if replace_import:
                    state.pop("reference_size", None)
                synced = True
                caption = imported["caption"]
                meta = _split_tags(imported["meta"])
                if imported.get("canvas") in CANVAS_TYPES:
                    canvas_type = imported["canvas"]
                state["palette"] = list(imported["palette"])
                state["meta"], state["canvas"] = meta, canvas_type
            else:
                caption = imported["caption"]
            state["caption"] = caption

        # 4) Compile in the one effective order used by both canvas and preview.
        ordered = effective_boxes(boxes, order_mode, visible_only=True)
        items, draft_items = build_items(ordered, W, H, zh)

        if items:
            layout_prompt = build_layout_prompt(items, meta, canvas_type, caption,
                                                state.get("palette") or [])
        else:
            layout_prompt = caption
        draft_json = build_draft_json(draft_items, meta, canvas_type, caption,
                                      state.get("palette") or [], W, H)

        # 5) Preview + UI payload for the editor.
        tags = display_tags(boxes)
        preview = render_preview(ordered, W, H, ref_image, tags, state.get("palette") or [],
                                 state.get("reference_size") if mode == SYNC_CENTER else None)

        ui: Dict[str, Any] = {"resolved_size": [[W, H]], "language": ["zh" if zh else "en"],
                              "ref_info": [None]}
        if synced:
            state.update(version=2, base_width=W, base_height=H, boxes=boxes)
            ui["synced_layout_data"] = [json.dumps(state, ensure_ascii=False, separators=(",", ":"))]
            ui["external_kind"] = [imported.get("kind", "") if imported else ""]
        elif imported and imported.get("kind") == "caption":
            # A caption-only link must not touch the boxes, but the editor should
            # still show the imported caption (F01 for the caption format).
            ui["synced_caption"] = [caption]
        if ref_image is not None:
            info = self._ref_info(ref_image, W, H)
            if info:
                ui["ref_info"] = [info]

        result = (layout_prompt, draft_json, _pil_to_tensor(preview), W, H)
        return {"ui": ui, "result": result}

    @staticmethod
    def _ref_info(ref_image: Any, W: int, H: int) -> Optional[Dict[str, Any]]:
        pil = _tensor_to_pil(ref_image)
        if pil is None:
            return None
        rw, rh = pil.size
        return {
            "size": [rw, rh],
            "aligned": [align16(rw), align16(rh)],
            "canvas": [W, H],
            "thumbnail": _thumbnail(ref_image),
        }


NODE_CLASS_MAPPINGS = {NODE_ID: VMMOSSLayoutStudio}
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: NODE_LABEL}
