"""Category-independent region interpretation and Qwen visual guidance."""

import cv2
import numpy as np

GUIDE_VERSION = "mask-reference-v2"


def coarse_alpha(allowed):
    """Feather inside coarse regions, keeping small regions fully editable."""
    distance = cv2.distanceTransform(allowed.astype(np.uint8), cv2.DIST_L2, 5)
    width = max(3, min(12, round(min(allowed.shape) * .008)))
    alpha = np.zeros(allowed.shape, np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(allowed.astype(np.uint8), 8)
    for label in range(1, count):
        x, y, w, h, _ = stats[label]
        component = labels[y:y+h, x:x+w] == label
        local_distance = distance[y:y+h, x:x+w]
        # A tiny separate target must not be faded away by a large-canvas radius.
        local_width = min(width, max(.5, float(local_distance[component].max()) - .5))
        t = np.clip((local_distance - .5) / local_width, 0, 1)
        values = np.rint(t*t*(3-2*t) * 255).astype(np.uint8)
        alpha[y:y+h, x:x+w][component] = values[component]
    return alpha, {"feather_policy": "inward-smoothstep-v1", "feather_work_px": width}


def _interior(boundary):
    """Return all enclosed background, including pixels next to the stroke."""
    # An explicit exterior prevents the image edge from closing an open contour.
    flooded = np.pad(boundary.astype(np.uint8), 1)
    cv2.floodFill(flooded, None, (0, 0), 2, flags=4)
    return flooded[1:-1, 1:-1] == 0


def outline_support(user):
    """Interpret closed interiors consistently, without expanding open strokes."""
    radius = max(2, min(4, round(min(user.shape)/300)))
    scope = user.copy()
    count, labels, stats, _ = cv2.connectedComponentsWithStats(user.astype(np.uint8), 8)
    enclosed_any = False
    repaired_components = 0
    for label in range(1, count):
        x, y, width, height, _ = stats[label]
        component = labels[y:y+height, x:x+width] == label
        enclosed = _interior(component)
        if enclosed.any():
            # Closed outlines need no morphological changes to their outside edge.
            filled = component | enclosed
        else:
            # Repair each stroke separately so nearby independent regions never join.
            pad = radius * 2 + 2
            boundary = np.pad(component.astype(np.uint8), pad)
            repaired = cv2.morphologyEx(boundary, cv2.MORPH_CLOSE,
                                       np.ones((radius*2+1, radius*2+1), np.uint8))
            repaired = repaired[pad:-pad, pad:-pad].astype(bool)
            enclosed = _interior(repaired)
            if not enclosed.any():
                continue
            filled = repaired | enclosed
            repaired_components += 1
        scope[y:y+height, x:x+width] |= filled
        enclosed_any = True
    return scope, {"enclosed": enclosed_any, "repaired_components": repaired_components,
                   "gap_radius": radius}


def coarse_region(user):
    """Fill only locally closed outlines; never extrapolate an open stroke."""
    scope, outline = outline_support(user)
    yy, xx = np.where(scope)
    if not len(xx):
        raise ValueError("VMN_EMPTY_SCOPE: 编辑范围为空。")
    width, height = int(xx.max()-xx.min()+1), int(yy.max()-yy.min()+1)
    density = float(scope.sum()) / (width*height)
    # Thin open strokes are location hints, not permission to edit a rectangle.
    if not outline["enclosed"] and (min(width, height) < 8 or density < .20):
        raise ValueError("VMN_REGION_OPEN: 圈选没有形成可靠范围；请闭合轮廓、填涂区域，或使用严格按所画遮罩。")
    return scope, {"route": "coarse_region", "policy": "source-outline-v2",
                   "filled_pixels": int((scope & ~user).sum()), "gap_radius": outline["gap_radius"],
                   "repaired_components": outline["repaired_components"],
                   "stroke_pixels": int(user.sum()), "scope_pixels": int(scope.sum()),
                   "extent": [int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)]}


def visual_guide(padded_rgb, allowed, protected, prompt):
    """A separate reference image; never replace the clean latent source."""
    region = np.zeros(padded_rgb.shape[:2], np.uint8)
    h, w = allowed.shape
    region[:h, :w] = (allowed & ~protected).astype(np.uint8) * 255
    guide = np.repeat(region[..., None], 3, axis=2)
    generated_prompt = (
        "Edit image 1 according to the user's request. Image 2 is only a black and white "
        "spatial mask aligned with image 1: white indicates the region where the requested "
        "edit is allowed, and black indicates content to preserve. The mask is not a "
        "reference for colors, objects, or style. Output the edited photograph from image 1; "
        "do not draw, copy or display the mask.\n"
        "User request:\n" + prompt
    )
    return guide, generated_prompt
