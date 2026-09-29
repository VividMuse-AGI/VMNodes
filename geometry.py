"""Shared, top-left anchored IMAGE/MASK transforms for VMNodes."""

import hashlib

import cv2
import numpy as np
import torch


INTERPOLATION = {
    "nearest-exact": cv2.INTER_NEAREST_EXACT,
    "bilinear": cv2.INTER_LINEAR,
    "area": cv2.INTER_AREA,
    "bicubic": cv2.INTER_CUBIC,
    "lanczos": cv2.INTER_LANCZOS4,
}

MAX_CANVAS_SIDE = 8192
MAX_CANVAS_PIXELS = 32_000_000


def rgb8(image):
    if image.ndim != 4 or image.shape[0] != 1 or image.shape[-1] < 3:
        raise ValueError("VMNodes 当前一次只处理一张图；请把多张主图分别排队。")
    return np.rint(np.clip(image[0, :, :, :3].detach().float().cpu().numpy(), 0, 1) * 255).astype(np.uint8)


def mask_array(mask, hw, *, optional=False):
    if mask is None:
        if optional:
            return np.zeros(hw, bool)
        raise ValueError("缺少编辑遮罩，请在主图的 Mask Editor 中绘制。")
    if mask.ndim == 3 and tuple(mask.shape) == (1, 64, 64) and not torch.any(mask != 0):
        return np.zeros(hw, bool)
    if mask.ndim != 3 or mask.shape[0] != 1 or tuple(mask.shape[1:]) != tuple(hw):
        raise ValueError("VMN_MASK_MISMATCH: 图像和遮罩尺寸不一致，请使用同一张图产生的遮罩。")
    values = mask[0].detach().float().cpu().numpy()
    if not np.isfinite(values).all() or values.min() < 0 or values.max() > 1:
        raise ValueError("VMN_MASK_INVALID: 遮罩值无效，请检查上游遮罩节点。")
    return values > 0.5


def stamp(rgb):
    return hashlib.sha256(np.ascontiguousarray(rgb).tobytes()).hexdigest()


def image_tensor(array):
    return torch.from_numpy(np.ascontiguousarray(array.astype(np.float32))).unsqueeze(0)


def mask_tensor(array):
    return torch.from_numpy(np.ascontiguousarray(array.astype(np.float32))).unsqueeze(0)


def canvas_size(width, height, divisor):
    return ((width + divisor - 1) // divisor * divisor,
            (height + divisor - 1) // divisor * divisor)


def validate_canvas(width, height):
    if width < 1 or height < 1 or width > MAX_CANVAS_SIDE or height > MAX_CANVAS_SIDE or width * height > MAX_CANVAS_PIXELS:
        raise ValueError(
            f"VMN_CANVAS_LIMIT: 输出画布 {width}×{height} 超过限制；"
            f"单边不超过 {MAX_CANVAS_SIDE}，总像素不超过 {MAX_CANVAS_PIXELS}。"
        )


def prepare_work_canvas(rgb, noise, *, external=False, backend="qwen21"):
    from .adapters import profile, validate_size
    align_x, align_y = profile(backend)["alignment"]
    """Use one padding rule for automatic and manually drawn selections."""
    height, width = rgb.shape[:2]
    if external:
        validate_size(width, height, backend)
        pad_height = pad_width = 0
    else:
        pad_height, pad_width = (-height) % align_y, (-width) % align_x
    padded_size = (width + pad_width, height + pad_height)
    validate_canvas(*padded_size)
    padded_rgb = np.pad(rgb, ((0, pad_height), (0, pad_width), (0, 0)), mode="edge")
    padded_noise = np.pad(noise.astype(np.float32), ((0, pad_height), (0, pad_width)))
    return padded_rgb, padded_noise, list(padded_size)


def resize_hard_mask(mask, size):
    width, height = size
    if mask.shape == (height, width):
        return mask.copy()
    interpolation = cv2.INTER_AREA if width < mask.shape[1] or height < mask.shape[0] else cv2.INTER_NEAREST_EXACT
    resized = cv2.resize(mask.astype(np.float32), size, interpolation=interpolation)
    return resized > (0 if interpolation == cv2.INTER_AREA else 0.5)


class VMImageResizeAlign:
    SEARCH_ALIASES = ["VMNodes", "VM Image Resize & Align", "image resize", "resize align",
                      "VM 图像缩放与对齐", "图像缩放", "图片缩放", "尺寸对齐", "缩放与对齐"]

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "resize_mode": (["保持原尺寸", "按长边", "按宽度", "按高度"],),
            "target_size": ("INT", {"default": 1024, "min": 32, "max": 8192}),
            "interpolation": (list(INTERPOLATION), {"default": "bicubic"}),
            "divisible_by": ([1, 8, 16, 32, 64], {"default": 32}),
        }, "optional": {
            "edit_mask": ("MASK",), "protect_mask": ("MASK",),
        }}

    RETURN_TYPES = ("IMAGE", "MASK", "MASK", "VM_IMAGE_CONTEXT", "STRING")
    RETURN_NAMES = ("图像", "编辑遮罩", "保护遮罩", "尺寸上下文", "尺寸信息")
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = "VMNodes/Image"

    def run(self, image, resize_mode, target_size, interpolation, divisible_by,
            edit_mask=None, protect_mask=None, frontend_session=""):
        result = self.apply(image, resize_mode, target_size, interpolation, divisible_by,
                            edit_mask, protect_mask)
        return {"ui": {"vm_size_info": [result[-1]]}, "result": result}

    def apply(self, image, resize_mode, target_size, interpolation, divisible_by,
              edit_mask=None, protect_mask=None):
        if image.ndim != 4 or image.shape[0] != 1 or image.shape[-1] not in (3, 4):
            raise ValueError("VMN_RESIZE_INPUT: 缩放节点一次只处理一张 RGB 或 RGBA 图像。")
        source = image[0].detach().float().cpu().numpy()
        h, w = source.shape[:2]
        if h < 1 or w < 1:
            raise ValueError("VMN_RESIZE_INPUT: 图像尺寸为空。")
        edit = mask_array(edit_mask, (h, w), optional=True)
        protect = mask_array(protect_mask, (h, w), optional=True)
        if resize_mode == "保持原尺寸":
            scale = 1.0
        elif resize_mode == "按长边":
            scale = target_size / max(w, h)
        elif resize_mode == "按宽度":
            scale = target_size / w
        else:
            scale = target_size / h
        content_w, content_h = max(1, round(w * scale)), max(1, round(h * scale))
        canvas_w, canvas_h = canvas_size(content_w, content_h, int(divisible_by))
        validate_canvas(canvas_w, canvas_h)
        if (content_w, content_h) == (w, h):
            content = source.copy()
        else:
            content = cv2.resize(source, (content_w, content_h), interpolation=INTERPOLATION[interpolation])
            if content.ndim == 2:
                content = content[..., None]
        changed_edit = resize_hard_mask(edit, (content_w, content_h))
        changed_protect = resize_hard_mask(protect, (content_w, content_h))
        if (canvas_w, canvas_h) != (content_w, content_h):
            content = np.pad(content, ((0, canvas_h - content_h), (0, canvas_w - content_w), (0, 0)), mode="edge")
            changed_edit = np.pad(changed_edit, ((0, canvas_h - content_h), (0, canvas_w - content_w)))
            changed_protect = np.pad(changed_protect, ((0, canvas_h - content_h), (0, canvas_w - content_w)))
        content = np.clip(content, 0, 1).astype(np.float32)
        processed = image_tensor(content)
        context = {
            "schema_version": 2,
            "original_rgb": rgb8(image),
            "original_edit": edit,
            "original_edit_present": edit_mask is not None,
            "original_protect": protect,
            "processed_protect": changed_protect,
            "processed_edit_sha256": stamp(changed_edit.astype(np.uint8)),
            "processed_protect_sha256": stamp(changed_protect.astype(np.uint8)),
            "source_size": (w, h),
            "content_size": (content_w, content_h),
            "canvas_size": (canvas_w, canvas_h),
            "padding": (0, 0, canvas_w - content_w, canvas_h - content_h),
            "divisible_by": int(divisible_by),
            "interpolation": interpolation,
            "processed_sha256": stamp(rgb8(processed)),
        }
        info = f"{w}×{h} → {content_w}×{content_h} → {canvas_w}×{canvas_h}"
        return processed, mask_tensor(changed_edit), mask_tensor(changed_protect), context, info


def restore_to_original(plan, generated, seam_harmonization="off", diagnostics=None):
    """Compose edited pixels only; untouched pixels come directly from the original."""
    from .vm_legacy.nodes import _rgb

    pre = _rgb(generated)
    h, w = plan["original"].shape[:2]
    if pre.shape[:2] != (plan["padded_size"][1], plan["padded_size"][0]):
        raise ValueError("VMN_PRE_MISMATCH: 生成结果与工作画布尺寸不一致，拒绝回贴。")
    pre = pre[:h, :w]
    context = plan.get("image_context")
    if context is None:
        base = plan["original"]
        alpha = plan["alpha"].astype(np.float32) / 255
        allowed = plan["allowed"]
        protected = plan["protected"]
    else:
        if context.get("schema_version") not in (1, 2) or tuple(context["canvas_size"]) != (w, h):
            raise ValueError("VMN_CONTEXT_MISMATCH: 尺寸上下文版本或工作画布不匹配。")
        content_w, content_h = context["content_size"]
        pre = pre[:content_h, :content_w]
        base = context["original_rgb"]
        old_h, old_w = base.shape[:2]
        if (content_w, content_h) != (old_w, old_h):
            pre = cv2.resize(pre, (old_w, old_h), interpolation=cv2.INTER_CUBIC)
            alpha = cv2.resize(plan["alpha"][:content_h, :content_w].astype(np.float32),
                               (old_w, old_h), interpolation=cv2.INTER_LINEAR) / 255
            allowed = resize_hard_mask(plan["allowed"][:content_h, :content_w], (old_w, old_h))
            protected = resize_hard_mask(plan["protected"][:content_h, :content_w], (old_w, old_h))
        else:
            alpha = plan["alpha"][:content_h, :content_w].astype(np.float32) / 255
            allowed = plan["allowed"][:content_h, :content_w]
            protected = plan["protected"][:content_h, :content_w]
        protected = protected | context["original_protect"]
        if plan["mode"] == "使用所画遮罩":
            allowed = allowed & context["original_edit"]
    hair = plan.get("auto_hair")
    boundary = plan.get("hair_boundary")
    if hair is not None and boundary is not None and boundary.any():
        if context is not None:
            content_w, content_h = context["content_size"]
            hair = hair[:content_h, :content_w]
            boundary = boundary[:content_h, :content_w]
            if hair.shape != base.shape[:2]:
                hair = resize_hard_mask(hair, (base.shape[1], base.shape[0]))
                boundary = resize_hard_mask(boundary, (base.shape[1], base.shape[0]))
        alpha = _protect_generated_hair(base, pre, alpha, allowed, protected, hair, boundary)
    if "source_scope" in plan:
        allowed = allowed & plan["source_scope"]
    alpha = alpha.copy()
    alpha[~allowed | protected] = 0
    plan["effective_alpha"] = alpha
    from .harmonize import harmonize, mode_value
    unadjusted = pre
    if plan["mode"] == "full_image":
        mode_value(seam_harmonization)
        info = {"mode": seam_harmonization, "status": "not_applicable_full_image",
                "pre_adjusted_pixels": 0, "final_changed_pixels": 0}
    else:
        pre, info = harmonize(base, pre, allowed, protected, seam_harmonization)
    result = np.rint(base.astype(np.float32) * (1 - alpha[..., None]) + pre.astype(np.float32) * alpha[..., None]).astype(np.uint8)
    result[~allowed | protected] = base[~allowed | protected]
    final_changed = 0
    if info["pre_adjusted_pixels"]:
        for y in range(0, len(base), 128):
            sl = np.s_[y:y+128]
            a = alpha[sl, ..., None]
            baseline = np.rint(base[sl].astype(np.float32)*(1-a) + unadjusted[sl].astype(np.float32)*a).astype(np.uint8)
            final_changed += int(np.any(result[sl] != baseline, axis=2).sum())
        if not final_changed:
            info.update(status="skipped", reason="below_final_quantization")
    info["final_changed_pixels"] = final_changed
    if diagnostics is not None:
        diagnostics.update(info)
    return result


def _protect_generated_hair(base, pre, alpha, allowed, protected, hair, boundary):
    """Reduce paste strength only when generated hair strongly disagrees with its source."""
    from .vm_legacy.core import erode

    scope = boundary & hair & allowed & ~protected & (alpha > 0)
    if not scope.any():
        return alpha
    hair_core = erode(hair, 3) & ~boundary
    garment_core = erode(allowed & ~hair, 3) & ~boundary
    if hair_core.sum() < 256 or garment_core.sum() < 256:
        return alpha
    source_lab = cv2.cvtColor(base, cv2.COLOR_RGB2LAB).astype(np.float32)
    hair_color = np.median(source_lab[hair_core], axis=0)
    garment_color = np.median(source_lab[garment_core], axis=0)
    if np.linalg.norm(hair_color - garment_color) < 24:
        return alpha
    hair_distance = np.linalg.norm(source_lab - hair_color, axis=2)
    garment_distance = np.linalg.norm(source_lab - garment_color, axis=2)
    confident = scope & (hair_distance + 20 < garment_distance)
    if not confident.any():
        return alpha
    pre_lab = cv2.cvtColor(pre, cv2.COLOR_RGB2LAB).astype(np.float32)
    disagreement = np.linalg.norm(source_lab - pre_lab, axis=2)
    rejection = np.clip((disagreement - 40) / 50, 0, 1)
    rejection[~confident] = 0
    if not np.any(rejection):
        return alpha
    rejection = cv2.GaussianBlur(rejection, (0, 0), 1.5)
    adjusted = alpha.copy()
    adjusted[confident] *= 1 - .9 * rejection[confident]
    return adjusted


def final_allowed_mask(plan):
    """Return the actual editable scope in the same coordinates as Final."""
    context = plan.get("image_context")
    if context is None:
        allowed = plan["allowed"].copy()
        protected = plan["protected"]
        alpha = plan["alpha"]
    else:
        h, w = plan["original"].shape[:2]
        if context.get("schema_version") not in (1, 2) or tuple(context["canvas_size"]) != (w, h):
            raise ValueError("VMN_CONTEXT_MISMATCH: 尺寸上下文版本或工作画布不匹配。")
        content_w, content_h = context["content_size"]
        old_h, old_w = context["original_rgb"].shape[:2]
        if (content_w, content_h) != (old_w, old_h):
            allowed = resize_hard_mask(plan["allowed"][:content_h, :content_w], (old_w, old_h))
            protected = resize_hard_mask(plan["protected"][:content_h, :content_w], (old_w, old_h))
            alpha = cv2.resize(plan["alpha"][:content_h, :content_w].astype(np.float32),
                               (old_w, old_h), interpolation=cv2.INTER_LINEAR)
        else:
            allowed = plan["allowed"][:content_h, :content_w].copy()
            protected = plan["protected"][:content_h, :content_w]
            alpha = plan["alpha"][:content_h, :content_w]
        protected = protected | context["original_protect"]
        if plan["mode"] == "使用所画遮罩":
            allowed = allowed & context["original_edit"]
    if "source_scope" in plan:
        allowed &= plan["source_scope"]
    return allowed & ~protected & (alpha > 0)
