"""Conservative, category-free boundary correction in source coordinates.

Only small, concordant residuals on BOTH sides of a structurally stable boundary
can contribute. There is deliberately no correction of a newly revealed surface
without matching anchors, no global color transfer, and no change to paste alpha.
"""

from collections import Counter

import cv2
import numpy as np

VERSION = "local-boundary-rgb-v2"


def mode_value(value):
    if value not in ("off", "auto"):
        raise ValueError("VMN_HARMONIZE_MODE: 接缝协调仅支持 off / auto。")
    return value


def _fit_offset(ri, ro, ti, to, vi, vo):
    """Internal rejection checks, not an independent quality evaluation."""
    if min(len(ti), len(to), len(vi), len(vo)) < 12:
        return None, "insufficient_validation"
    di, do = np.median(ri, axis=0), np.median(ro, axis=0)
    if not np.isfinite([di, do]).all() or max(np.max(np.abs(di)), np.max(np.abs(do))) > 8:
        return None, "large_residual"
    if min(np.linalg.norm(di), np.linalg.norm(do)) < .75:
        return None, "no_shared_bias"
    if np.dot(di, do) <= 0 or np.max(np.abs(di - do)) > 2:
        return None, "inconsistent_sides"
    if max(np.max(np.median(np.abs(ri-di), axis=0)), np.max(np.median(np.abs(ro-do), axis=0))) > 2:
        return None, "unstable_channel"
    delta = np.median(np.concatenate([ti, to]), axis=0)
    if not np.isfinite(delta).all() or np.max(np.abs(delta)) > 8:
        return None, "fitted_offset_out_of_bounds"
    if max(np.max(np.abs(delta-di)), np.max(np.abs(delta-do))) > 2:
        return None, "fitted_offset_inconsistent"
    for validation in (vi, vo):
        before = np.mean(np.abs(validation), axis=0)
        after = np.mean(np.abs(validation - .65*delta), axis=0)
        if np.any(after > before + .05) or np.mean(after) >= np.mean(before) - .05:
            return None, "side_or_channel_not_improved"
    return delta, None


def _harmonize_region(base, generated, allowed, protected, mode="auto", *, radius=None,
                      origin=(0, 0), region_labels=None):
    mode_value(mode)
    info = {"mode": mode, "version": VERSION, "status": "off", "pre_adjusted_pixels": 0}
    if mode == "off":
        return generated, info
    h, w = allowed.shape
    editable = allowed & ~protected
    info["status"] = "skipped"
    if not editable.any() or not (~allowed & ~protected).any():
        info["reason"] = "no_two_sided_context"
        return generated, info

    # Work in encoded RGB for the first isolated candidate: blending itself is
    # unchanged. Units below are 8-bit levels, not linear-light intensities.
    radius = radius or max(8, min(24, round(min(h, w) / 96)))
    width = radius * 3
    inside = cv2.distanceTransform(editable.astype(np.uint8), cv2.DIST_L2, 5)
    outside = cv2.distanceTransform((~allowed).astype(np.uint8), cv2.DIST_L2, 5)
    boundary = editable & (inside <= 1.5)
    if region_labels is None:
        _, region_labels = cv2.connectedComponents(editable.astype(np.uint8), connectivity=4)
    a = base.astype(np.float32)
    b = generated.astype(np.float32)
    gray_a = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    gray_b = cv2.cvtColor(b, cv2.COLOR_RGB2GRAY)
    # Local demeaned structure correlation tolerates a small additive color bias.
    mean = lambda x: cv2.boxFilter(x, -1, (7, 7), borderType=cv2.BORDER_REFLECT)
    ma, mb = mean(gray_a), mean(gray_b)
    va = np.maximum(0, mean(gray_a * gray_a) - ma * ma)
    vb = np.maximum(0, mean(gray_b * gray_b) - mb * mb)
    cov = mean(gray_a * gray_b) - ma * mb
    corr = cov / np.sqrt(np.maximum(va * vb, .01))
    stable = (corr > .90) & (va > 2.25) & (vb > 2.25)
    # Smooth-color edges act as barriers, rather than treating cloth texture as
    # a material boundary. Requiring stability on O and G rejects moved contours.
    for rgb in (a, b):
        smooth = cv2.GaussianBlur(rgb, (0, 0), 1.5)
        dx = cv2.Sobel(smooth, -1, 1, 0, ksize=3) / 8
        dy = cv2.Sobel(smooth, -1, 0, 1, ksize=3) / 8
        stable &= np.max(np.sqrt(dx * dx + dy * dy), axis=2) < 8
    stable &= (gray_a > 12) & (gray_b > 12) & (gray_a < 243) & (gray_b < 243)
    # Reject channel clipping independently of luminance/texture checks.
    stable &= np.all((a > 1) & (a < 254) & (b > 1) & (b < 254), axis=2)
    stable &= ~protected
    residual = a - b
    # Large edits are rejected, not clamped into an apparently safe small edit.
    stable &= np.max(np.abs(residual), axis=2) <= 18
    sums = np.zeros_like(a)
    weights = np.zeros((h, w), np.float32)
    reasons = Counter()
    accepted = 0
    estimates = []
    for y in range((-origin[0]) % radius, h, radius):
        for x in range((-origin[1]) % radius, w, radius):
            points = np.argwhere(boundary[y:y + radius, x:x + radius])
            if not len(points):
                continue
            cy, cx = points[len(points) // 2] + (y, x)
            y0, y1 = max(0, cy - width), min(h, cy + width + 1)
            x0, x1 = max(0, cx - width), min(w, cx + width + 1)
            sl = np.s_[y0:y1, x0:x1]
            same_region = region_labels[sl] == region_labels[cy, cx]
            n, labels = cv2.connectedComponents(stable[sl].astype(np.uint8), connectivity=4)
            for label in range(1, n):
                component = labels == label
                if not np.any(component & boundary[sl] & same_region):
                    continue
                inner = component & same_region & (inside[sl] <= radius)
                outer = component & ~allowed[sl] & (outside[sl] <= radius)
                if min(int(inner.sum()), int(outer.sum())) < max(24, radius * 2):
                    reasons["insufficient_two_sided_anchors"] += 1
                    continue
                ri, ro = residual[sl][inner], residual[sl][outer]
                yy, xx = np.indices(component.shape)
                fit = ((yy + y0 + origin[0]) // 4 + (xx + x0 + origin[1]) // 4) % 2 == 0
                r = residual[sl]
                delta, reason = _fit_offset(ri, ro, r[inner & fit], r[outer & fit],
                                            r[inner & ~fit], r[outer & ~fit])
                if reason:
                    reasons[reason] += 1
                    continue
                # A component cannot bridge an edge or a protection hole.
                # Distance to its boundary tapers support, avoiding a hard mask
                # around the per-pixel stability gate or around a patch edge.
                local_dist = cv2.distanceTransform(np.pad(component.astype(np.uint8), 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
                feather = np.clip((local_dist - 1) / 3, 0, 1)
                radial = np.maximum(0, 1 - ((yy + y0 - cy) ** 2 + (xx + x0 - cx) ** 2) / width ** 2) ** 2
                inward = np.clip(1 - inside[sl] / width, 0, 1) ** 2
                weight = radial * feather * inward * same_region
                # Reject corrections entering newly changed structures as well.
                weight *= component
                if not weight.any():
                    continue
                sums[sl] += weight[..., None] * delta
                weights[sl] += weight
                estimates.append(delta.tolist())
                accepted += 1
    info.update(band_source_px=width, accepted_patches=accepted, rejected=dict(reasons))
    support = weights > 0
    if not support.any():
        info["reason"] = "no_reliable_anchors"
        return generated, info
    correction = sums[support] / weights[support, None]
    # Bounded confidence preserves the taper even when few patches overlap.
    correction *= (.65 * np.minimum(weights[support], 1))[:, None]
    adjusted = generated.copy()
    adjusted[support] = np.rint(np.clip(b[support] + correction, 0, 255)).astype(np.uint8)
    changed = np.any(adjusted != generated, axis=2)
    count = int(changed.sum())
    info.update(status="applied" if count else "skipped", pre_adjusted_pixels=count,
                candidate_boundary_pixels=int(boundary.sum()),
                changed_boundary_fraction=float((changed & boundary).sum() / max(1, boundary.sum())),
                median_offset_rgb=np.median(estimates, axis=0).tolist(),
                max_adjustment_rgb=int(np.max(np.abs(adjusted.astype(np.int16) - generated))))
    if not count:
        info["reason"] = "below_quantization"
        return generated, info
    return adjusted, info


def harmonize(base, generated, allowed, protected, mode="off"):
    """Bound float buffers to boundary tiles; retain source-coordinate grid phase."""
    mode_value(mode)
    info = dict(mode=mode, version=VERSION, status="off", pre_adjusted_pixels=0)
    if mode == "off":
        return generated, info
    h, w = allowed.shape
    editable = allowed & ~protected
    info["status"] = "skipped"
    if not editable.any() or not (~allowed & ~protected).any():
        info["reason"] = "no_two_sided_context"
        return generated, info
    radius = max(8, min(24, round(min(h, w) / 96)))
    width = radius * 3
    # Erosion's default outside value preserves the full-image distance semantics.
    boundary = editable & ~cv2.erode(editable.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    _, labels = cv2.connectedComponents(editable.astype(np.uint8), connectivity=4)
    halo = 2*width + radius + 8
    output = generated
    count = maximum = tiles = accepted = 0
    rejected = Counter()
    for y in range(0, h, 512):
        for x in range(0, w, 512):
            yh, xh = min(h, y+512), min(w, x+512)
            if not boundary[max(0,y-width):min(h,yh+width), max(0,x-width):min(w,xh+width)].any():
                continue
            y0, y1 = max(0,y-halo), min(h,yh+halo)
            x0, x1 = max(0,x-halo), min(w,xh+halo)
            sl = np.s_[y0:y1,x0:x1]
            adjusted, part = _harmonize_region(base[sl], generated[sl], allowed[sl], protected[sl],
                                              radius=radius, origin=(y0,x0), region_labels=labels[sl])
            core = adjusted[y-y0:yh-y0, x-x0:xh-x0]
            old = generated[y:yh,x:xh]
            n = int(np.any(core != old, axis=2).sum())
            if n:
                if output is generated:
                    output = generated.copy()
                output[y:yh,x:xh] = core
                maximum = max(maximum, int(np.abs(core.astype(np.int16)-old).max()))
                count += n
            tiles += 1
            accepted += part.get("accepted_patches", 0)
            rejected.update(part.get("rejected", {}))
    info.update(status="applied" if count else "skipped", pre_adjusted_pixels=count,
                max_adjustment_rgb=maximum, band_source_px=width, tiles=tiles,
                accepted_patch_evaluations=accepted, rejected=dict(rejected))
    # Overlapping tiles repeat patch evaluations; this is not a unique patch count.
    if not count:
        info["reason"] = "no_reliable_anchors_or_below_quantization"
    return output, info
