"""VMNodes single visible image edit entry and its private compositing helper."""

import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np
import torch

import folder_paths
from comfy_execution.graph_utils import ExecutionBlocker, GraphBuilder

from .geometry import (mask_array, mask_tensor, prepare_work_canvas, resize_hard_mask,
                       rgb8, restore_to_original, stamp)
from .vm_legacy.core import dilate
from .vm_legacy.nodes import CoarsePlan, _preview, _sha, _tensor
from .version import BUILD
from .region import GUIDE_VERSION, coarse_region, coarse_alpha, visual_guide

AUDIT_METADATA_REVISION = 1


def _plan(image, rough_mask, prompt, selection_mode, sam_model, sam_clip,
          protect_mask=None, image_context=None, canvas_policy="legacy", backend="qwen21"):
    from .adapters import profile, validate_size
    backend_profile = profile(backend)
    if not isinstance(prompt,str) or not prompt.strip():
        raise ValueError("VMN_EMPTY_PROMPT: 请填写编辑需求。")
    original = rgb8(image)
    h, w = original.shape[:2]
    full_image = selection_mode == "full_image"
    # ComfyUI's LoadImage uses a 64x64 zero MASK when no alpha/mask was painted.
    # Report the actionable empty-mask error before checking image dimensions.
    if not full_image and (rough_mask is None or not torch.any(rough_mask > 0.01)):
        raise ValueError("编辑遮罩为空，请在目标内部画几笔或填满需要修补的区域。")
    user = np.zeros((h, w), bool) if full_image else mask_array(rough_mask, (h, w))
    if not full_image and user.sum() < 4:
        raise ValueError("编辑遮罩为空，请在目标内部画几笔或填满需要修补的区域。")
    protection = mask_array(protect_mask, (h, w), optional=True)
    if canvas_policy not in ("legacy", "external"):
        raise ValueError("VMN_CANVAS_POLICY: 未知的画布策略。")
    # A fresh bridge can be used without the separate resize node. In that
    # case its historical right/bottom padding is still the effective policy.
    if image_context is None:
        canvas_policy = "legacy"
    elif canvas_policy == "external":
        validate_size(w, h, backend)
    if image_context is not None:
        version = image_context.get("schema_version")
        if (version not in (1, 2) or
                tuple(image_context.get("canvas_size", ())) != (w, h) or
                image_context.get("processed_sha256") != stamp(original)):
            raise ValueError("尺寸上下文与当前图像不匹配，请将同一个缩放节点的图像、遮罩和上下文一起连接。")
        if full_image:
            if version == 1 and canvas_policy == "external":
                raise ValueError("VMN_CANVAS_POLICY: 旧尺寸上下文只能使用兼容画布策略；请重新连接新版缩放节点。")
        elif version == 2:
            if not image_context.get("original_edit_present"):
                raise ValueError("VMN_CONTEXT_EDIT: 缩放节点未接原图编辑遮罩；请先在原图画遮罩并同步缩放。")
            if stamp(user.astype(np.uint8)) != image_context.get("processed_edit_sha256"):
                raise ValueError("VMN_CONTEXT_EDIT: 编辑遮罩已与尺寸上下文分离；请连接同一个缩放节点的遮罩输出。")
        else:
            if not np.any(image_context["original_edit"]):
                raise ValueError("VMN_CONTEXT_EDIT: 旧尺寸上下文缺少原图编辑遮罩；请在原图画遮罩后重新缩放。")
            content_w, content_h = image_context["content_size"]
            expected_edit = resize_hard_mask(image_context["original_edit"], (content_w, content_h))
            expected_edit = np.pad(expected_edit, ((0, h - content_h), (0, w - content_w)))
            if not np.array_equal(user, expected_edit):
                raise ValueError("VMN_CONTEXT_EDIT: 编辑遮罩已与旧尺寸上下文分离；请连接同一个缩放节点的遮罩输出。")
            if canvas_policy == "external":
                raise ValueError("VMN_CANVAS_POLICY: 旧尺寸上下文只能使用兼容画布策略；请重新连接新版缩放节点。")
        if protect_mask is not None and not np.array_equal(protection, image_context["processed_protect"]):
            raise ValueError("VMN_CONTEXT_PROTECT: 保护遮罩已与尺寸上下文分离；请连接同一个缩放节点的保护遮罩输出。")
        protection |= image_context["processed_protect"]
    if selection_mode == "自动选中目标":
        if sam_model is None or sam_clip is None:
            raise ValueError("自动选中目标需要连接 SAM3 模型和编码器。")
        plan, padded, noise, _ = CoarsePlan().build(
            image, rough_mask, prompt, "粗涂补全目标", sam_model, sam_clip,
            canvas_policy=canvas_policy, protect_mask=mask_tensor(protection), backend=backend)
    else:
        source_scope = None
        evidence = {"route": "drawn_mask"}
        if full_image:
            scope = np.ones((h, w), bool)
            if image_context:
                cw, ch = image_context["content_size"]
                scope[ch:, :] = False
                scope[:, cw:] = False
            source_shape = image_context["original_rgb"].shape[:2] if image_context else (h, w)
            source_scope = np.ones(source_shape, bool)
            evidence = {"route": "full_image", "policy": "whole-image-v1", "edit_mask_used": False}
        elif selection_mode == "按粗选范围":
            source_user = image_context["original_edit"] if image_context else user
            source_scope, evidence = coarse_region(source_user)
            if image_context:
                cw, ch = image_context["content_size"]
                scope = resize_hard_mask(source_scope, (cw, ch))
                scope = np.pad(scope, ((0, h-ch), (0, w-cw)))
            else:
                scope = source_scope
        elif selection_mode == "使用所画遮罩":
            scope = user
        else:
            raise ValueError("VMN_SELECTION_FAILED: 未知选区方式。")
        allowed = scope & ~protection
        if full_image and not protection.any():
            alpha = (allowed * 255).astype(np.uint8)
        elif selection_mode == "按粗选范围":
            alpha, feather_evidence = coarse_alpha(allowed)
            evidence.update(feather_evidence)
        else:
            distance = cv2.distanceTransform((~protection if full_image else allowed).astype(np.uint8), cv2.DIST_L2, 5)
            alpha = np.rint(np.clip((distance - .5) / 2, 0, 1) * 255).astype(np.uint8)
            if full_image:
                alpha[~allowed] = 0
        if not np.any(allowed & (alpha > 0)):
            raise ValueError("编辑范围为空或被保护遮罩完全覆盖，请调整遮罩。")
        radius = max(8, round(min(w, h) * .016))
        generated_noise = dilate(allowed, radius)
        padded_rgb, padded_noise, padded_size = prepare_work_canvas(
            original, generated_noise, external=canvas_policy == "external", backend=backend)
        if full_image:
            generated_noise = np.ones((h, w), bool)
            padded_noise = np.ones(padded_rgb.shape[:2], np.float32)
        padded = _tensor(padded_rgb)
        noise = torch.from_numpy(padded_noise).unsqueeze(0)
        plan = {"original": original, "user": user, "allowed": allowed,
                "noise": generated_noise, "protected": protection, "alpha": alpha,
                "preview": _preview(original, allowed, protection, scope),
                "padded_size": padded_size, "person_guard": None, "warnings": [],
                "selection_evidence": evidence}
        if source_scope is not None:
            plan["source_scope"] = source_scope
            # Words alone do not create a hard mask. No detector is loaded here.
            from .vm_legacy.core import request_hints
            hints = {} if full_image else request_hints(prompt)
            if hints.get("protected") or hints.get("unresolved_protection"):
                plan["warnings"].append("semantic_protection")
        if full_image:
            preview = original.copy()
            cw, ch = image_context["content_size"] if image_context else (w, h)
            cv2.rectangle(preview, (0, 0), (cw-1, ch-1), (50, 210, 100), 2)
            preview[protection] = np.rint(.55*original[protection] + .45*np.array([70,100,255])).astype(np.uint8)
            plan["preview"] = preview
            if protection.any():
                plan["warnings"].append("full_image_protection")
    plan["backend"] = backend_profile
    plan["mode"] = selection_mode
    plan["prompt"] = prompt
    plan["image_context"] = image_context
    source = image_context["original_rgb"] if image_context else original
    source_edit = (np.zeros(source.shape[:2], bool) if full_image else
                   image_context["original_edit"] if image_context else user)
    source_protect = image_context["original_protect"] if image_context else protection
    mapping = {key: image_context.get(key) for key in (
        "schema_version", "source_size", "content_size", "canvas_size", "padding",
        "divisible_by", "interpolation")} if image_context else None
    guide, generated_prompt = visual_guide(rgb8(padded), plan["allowed"], plan["protected"], prompt)
    plan["guide_image"] = guide
    plan["generation_prompt"] = generated_prompt
    guide_meta = {"version": GUIDE_VERSION, "image_sha256": stamp(guide),
                  "prompt_sha256": hashlib.sha256(generated_prompt.encode()).hexdigest()}
    plan["guidance"] = guide_meta
    provenance = json.dumps({"build": BUILD, "canvas_policy": canvas_policy, "backend": backend_profile,
                             "padded_size": plan["padded_size"], "mapping": mapping,
                             "guidance": guide_meta,
                             "source_scope_sha256": stamp(plan["source_scope"]) if "source_scope" in plan else None},
                            sort_keys=True, ensure_ascii=False)
    plan["build"] = BUILD
    plan["provenance"] = provenance
    plan["source_protect"] = source_protect.copy()
    plan["signature"] = _sha(original, user.astype(np.uint8), plan["allowed"].astype(np.uint8),
                              plan["noise"].astype(np.uint8), plan["alpha"],
                              plan["protected"].astype(np.uint8), source,
                              source_edit.astype(np.uint8), source_protect.astype(np.uint8),
                              text=prompt + "\n" + selection_mode + "\n" + provenance)
    if os.environ.get("VM_IMAGE_EDIT_AUDIT") == "1":
        audit_dir = Path(os.environ.get("VM_IMAGE_EDIT_AUDIT_DIR") or
                         Path(folder_paths.get_user_directory()) / "vmnodes" / "audit")
        audit_dir.mkdir(parents=True, exist_ok=True)
        source = image_context["original_rgb"] if image_context else original
        source_shape = source.shape[:2]
        np.savez_compressed(audit_dir / (plan["signature"] + "-plan.npz"),
                            plan_signature=np.array(plan["signature"]),
                            build=np.array(BUILD), provenance=np.array(provenance),
                            selection_evidence=np.array(json.dumps(plan.get('selection_evidence',{}),ensure_ascii=False)),
                            original=original,
                            allowed=plan["allowed"].astype(np.uint8),
                            protected=plan["protected"].astype(np.uint8),
                            alpha=plan["alpha"],
                            noise=plan["noise"].astype(np.uint8),
                            source_original=source,
                            source_edit=(image_context["original_edit"] if image_context else user).astype(np.uint8),
                            source_protect=source_protect.astype(np.uint8),
                            source_scope=plan.get("source_scope", source_edit).astype(np.uint8),
                            guide_image=guide,
                            generation_prompt=np.array(generated_prompt),
                            content_size=np.array(image_context["content_size"] if image_context else
                                                  source_shape[::-1]),
                            padded_size=np.array(plan["padded_size"]),
                            context_schema=np.array(image_context.get("schema_version", 0) if image_context else 0))
    return plan, padded, noise


class VMImageEdit:
    DEV_ONLY = True  # V13 workflows remain loadable without crowding the node search.

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",), "edit_mask": ("MASK",),
            "prompt": ("STRING", {"multiline": True, "default": "把上衣改成深红色，保留脸和手。"}),
            "selection_mode": (["自动选中目标", "使用所画遮罩"],),
            "run_mode": (["直接生成", "仅预览范围"],),
            "model": ("MODEL", {"lazy": True}),
            "clip": ("CLIP", {"lazy": True}),
            "vae": ("VAE", {"lazy": True}),
            "seed": ("INT", {"default": 1001, "min": 0, "max": 18446744073709551615}),
        }, "optional": {
            "sam_model": ("MODEL", {"lazy": True}),
            "sam_clip": ("CLIP", {"lazy": True}),
            "protect_mask": ("MASK",),
            "reference_image": ("IMAGE",),
            "image_context": ("VM_IMAGE_CONTEXT",),
        }}

    RETURN_TYPES = ("IMAGE", "MASK", "IMAGE")
    RETURN_NAMES = ("最终图像", "允许区遮罩", "范围预览")
    FUNCTION = "edit"
    CATEGORY = "VMNodes/Image"

    def check_lazy_status(self, image, edit_mask, prompt, selection_mode, run_mode,
                          model=None, clip=None, vae=None, seed=1001,
                          sam_model=None, sam_clip=None, protect_mask=None,
                          reference_image=None, image_context=None):
        needed = []
        if selection_mode == "自动选中目标":
            if sam_model is None:
                needed.append("sam_model")
            if sam_clip is None:
                needed.append("sam_clip")
        if run_mode == "直接生成":
            for name, value in (("model", model), ("clip", clip), ("vae", vae)):
                if value is None:
                    needed.append(name)
        return needed

    def edit(self, image, edit_mask, prompt, selection_mode, run_mode,
             model=None, clip=None, vae=None, seed=1001,
             sam_model=None, sam_clip=None, protect_mask=None,
             reference_image=None, image_context=None):
        plan, padded, noise = _plan(image, edit_mask, prompt, selection_mode,
                                    sam_model, sam_clip, protect_mask, image_context)
        preview = _tensor(plan["preview"])
        allowed = mask_tensor(plan["allowed"])
        if run_mode == "仅预览范围":
            return (ExecutionBlocker(None), allowed, preview)
        if model is None or clip is None or vae is None:
            raise ValueError("直接生成需要连接 Qwen 模型、文本编码器和 VAE。")
        graph = GraphBuilder()
        text_inputs = {"clip": clip, "vae": vae, "prompt": prompt,
                       "negative_prompt": "", "resolution": 0, "images.image_1": padded}
        if reference_image is not None:
            text_inputs["images.image_2"] = reference_image
        conditioning = graph.node("TextEncodeQwenImage21", **text_inputs)
        latent = graph.node("VAEEncode", pixels=padded, vae=vae)
        masked = graph.node("SetLatentNoiseMask", samples=latent.out(0), mask=noise)
        sample = graph.node("KSampler", model=model, positive=conditioning.out(0),
                            negative=conditioning.out(1), latent_image=masked.out(0),
                            seed=seed, steps=25, cfg=1.0,
                            sampler_name="euler", scheduler="simple", denoise=1.0)
        decoded = graph.node("VAEDecode", samples=sample.out(0), vae=vae)
        final = graph.node("VMFinalizeEdit", plan=plan, generated_pre=decoded.out(0))
        return {"result": (final.out(0), allowed, ExecutionBlocker(None)),
                "expand": graph.finalize()}


class VMFinalizeEdit:
    """Internal final step; VMImageEdit is the public entry point."""

    DEV_ONLY = True

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"plan": ("VM_EDIT_PLAN",), "generated_pre": ("IMAGE",)},
                "optional": {"seam_harmonization": (("off", "auto"), {"default": "off"})}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "finish"
    CATEGORY = "VMNodes/Internal"

    def finish(self, plan, generated_pre, seam_harmonization="off", _diagnostics=None):
        # Each Finish owns its diagnostic state; a shared plan is read-only.
        plan = dict(plan)
        diagnostics = {} if _diagnostics is None else _diagnostics
        final = restore_to_original(plan, generated_pre, seam_harmonization, diagnostics)
        if os.environ.get("VM_IMAGE_EDIT_AUDIT") == "1":
            audit_dir = Path(os.environ.get("VM_IMAGE_EDIT_AUDIT_DIR") or
                             Path(folder_paths.get_user_directory()) / "vmnodes" / "audit")
            audit_dir.mkdir(parents=True, exist_ok=True)
            from .vm_legacy.nodes import _rgb
            recorded_pre = _rgb(generated_pre)
            recorded_float = generated_pre.detach().to(device="cpu", dtype=torch.float32).numpy()
            name = hashlib.sha256((plan["signature"] + stamp(final) + stamp(recorded_pre) +
                                   stamp(recorded_float) + str(generated_pre.dtype) +
                                   json.dumps(diagnostics, sort_keys=True) +
                                   f"audit_metadata_revision={AUDIT_METADATA_REVISION}").encode()).hexdigest()
            detail = {key: value.astype(np.uint8) for key, value in plan.get("diagnostic", {}).items()}
            context = plan.get("image_context")
            source = context["original_rgb"] if context else plan["original"]
            source_shape = source.shape[:2]
            np.savez_compressed(audit_dir / (name + ".npz"),
                                audit_schema=np.array(2),
                                audit_metadata_revision=np.array(AUDIT_METADATA_REVISION),
                                pre_float32=recorded_float,
                                pre_tensor_dtype=np.array(str(generated_pre.dtype)),
                                pre_float32_layout=np.array("BHWC; all source channels retained; before RGB extraction and quantization"),
                                pre_channel_count=np.array(recorded_float.shape[-1]),
                                pre_rgb_channel_indices=np.array([0, 1, 2], dtype=np.int32),
                                pre_extra_channel_semantics=np.array(
                                    "unknown; excluded from RGB compositing" if recorded_float.shape[-1] > 3 else "none"),
                                pre_rgb8_policy=np.array("clip then round to nearest 8-bit; not SaveImage truncation"),
                                original=plan["original"], A=plan["allowed"].astype(np.uint8),
                                P=plan["protected"].astype(np.uint8),
                                alpha=plan["alpha"], noise=plan["noise"].astype(np.uint8),
                                effective_alpha=plan["effective_alpha"],
                                seam_harmonization=np.array(json.dumps(diagnostics)),
                                pre=recorded_pre, final=final, mode=np.array(plan["mode"]),
                                plan_signature=np.array(plan["signature"]),
                                build=np.array(plan.get("build", BUILD)),
                                provenance=np.array(plan.get("provenance", "")),
                                selection_evidence=np.array(json.dumps(plan.get('selection_evidence',{}),ensure_ascii=False)),
                                padded_size=np.array(plan["padded_size"]),
                                context_schema=np.array(context.get("schema_version", 0) if context else 0),
                                content_size=np.array(context["content_size"] if context else source_shape[::-1]),
                                source_original=source,
                                source_edit=(context["original_edit"] if context else plan["user"]).astype(np.uint8),
                                source_protect=plan.get("source_protect", np.zeros(source_shape, bool)).astype(np.uint8),
                                source_scope=plan.get("source_scope", context["original_edit"] if context else plan["user"]).astype(np.uint8),
                                **detail)
        return (_tensor(final),)
