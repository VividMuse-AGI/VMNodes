"""Two execution stages behind the single VMNodes editor canvas shell."""

import json
from pathlib import Path

import folder_paths
from PIL import Image, PngImagePlugin

from comfy_execution.graph_utils import ExecutionBlocker

from .edit import VMFinalizeEdit, _plan
from .geometry import final_allowed_mask, mask_tensor
from .vm_legacy.nodes import _tensor
from .version import BUILD
from .harmonize import mode_value
from .adapters import profile


SELECTION_MODES = ("auto_target", "drawn_mask", "coarse_region", "full_image")
RUN_MODES = ("generate", "preview")
_ABSENT = object()


def selection_mode_value(value):
    return {"自动选中目标": "auto_target", "Select target": "auto_target",
            "细化到物体": "auto_target", "Refine to object": "auto_target",
            "使用所画遮罩": "drawn_mask", "Use drawn mask": "drawn_mask",
            "严格按所画遮罩": "drawn_mask", "Strict drawn mask": "drawn_mask",
            "按粗选范围": "coarse_region", "Coarse region": "coarse_region",
            "整图编辑（无需遮罩）": "full_image", "Full-image edit (no mask)": "full_image"}.get(value, value)


def run_mode_value(value):
    return {"直接生成": "generate", "Generate": "generate",
            "仅预览范围": "preview", "Preview range only": "preview"}.get(value, value)


class VMImageEditBridge:
    """Canvas definition. The frontend compiles it into VMEditPlan and VMEditFinish."""

    SEARCH_ALIASES = ["VMNodes", "VM Image Edit", "image edit", "edit image",
                      "VM 图像编辑", "图像编辑", "图片编辑", "局部编辑"]

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "prompt": ("STRING", {"multiline": True, "default": "把白色上衣改成深红色，保留脸和手。"}),
            "selection_mode": (SELECTION_MODES, {"default": "coarse_region"}),
            "run_mode": (RUN_MODES,),
            "filename_prefix": ("STRING", {"default": "VMNodes/Edit"}),
        }, "optional": {
            "edit_mask": ("MASK",),
            "sam_model": ("MODEL",),
            "sam_clip": ("CLIP",),
            "protect_mask": ("MASK",),
            "image_context": ("VM_IMAGE_CONTEXT",),
            "generated_pre": ("IMAGE",),
            "seam_harmonization": (("off", "auto"), {"default": "off"}),
        }}

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "IMAGE", "MASK", "IMAGE", "IMAGE", "STRING")
    RETURN_NAMES = ("padded_image", "noise_mask", "edit_prompt", "preview_image",
                    "allowed_mask", "final_image", "guide_image", "generation_prompt")
    FUNCTION = "needs_frontend"
    OUTPUT_NODE = True
    CATEGORY = "VMNodes/Image"

    def needs_frontend(self, **_kwargs):
        raise RuntimeError("VMNodes frontend extension required / 需要 VMNodes 前端扩展；请加载 web/bridge.js 并刷新 ComfyUI。")


class VMEditPlan:
    DEV_ONLY = True

    @classmethod
    def VALIDATE_INPUTS(cls, backend="qwen21"):
        # Reject retired API values before queueing, even on hosts that skip
        # validating tuple-based optional combo choices.
        try:
            profile(backend)
        except ValueError as error:
            return str(error)
        return True

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "prompt": ("STRING", {"multiline": True}),
            "selection_mode": (SELECTION_MODES,),
        }, "optional": {
            "edit_mask": ("MASK", {"lazy": True}),
            "sam_model": ("MODEL", {"lazy": True}),
            "sam_clip": ("CLIP", {"lazy": True}),
            "protect_mask": ("MASK",),
            "image_context": ("VM_IMAGE_CONTEXT",),
            "canvas_policy": (("legacy", "external"), {"default": "legacy"}),
            "backend": (("qwen21", "manual_image"), {"default": "qwen21"}),
        }}

    RETURN_TYPES = ("VM_EDIT_PLAN", "IMAGE", "MASK", "STRING", "IMAGE", "MASK", "IMAGE", "STRING")
    RETURN_NAMES = ("plan", "padded_image", "noise_mask", "edit_prompt",
                    "preview_image", "allowed_mask", "guide_image", "generation_prompt")
    FUNCTION = "build"
    CATEGORY = "VMNodes/Internal"

    def check_lazy_status(self, image, edit_mask=_ABSENT, prompt="", selection_mode="coarse_region",
                          sam_model=_ABSENT, sam_clip=_ABSENT, **_kwargs):
        mode = selection_mode_value(selection_mode)
        needed = ["edit_mask"] if mode != "full_image" and edit_mask is None else []
        if mode == "auto_target":
            needed += [name for name, value in (("sam_model", sam_model), ("sam_clip", sam_clip)) if value is None]
        return needed

    def build(self, image, edit_mask=None, prompt="", selection_mode="coarse_region",
              sam_model=None, sam_clip=None, protect_mask=None, image_context=None,
              canvas_policy="legacy", backend="qwen21"):
        selection_mode = selection_mode_value(selection_mode)
        if selection_mode not in SELECTION_MODES:
            raise ValueError("Invalid VMNodes selection mode.")
        legacy_mode = {"auto_target": "自动选中目标", "drawn_mask": "使用所画遮罩",
                       "coarse_region": "按粗选范围", "full_image": "full_image"}[selection_mode]
        try:
            plan, padded, noise = _plan(image, edit_mask, prompt, legacy_mode,
                                        sam_model, sam_clip, protect_mask, image_context,
                                        canvas_policy, backend)
        except ValueError as error:
            message = str(error)
            if message.startswith("VMN_"):
                raise
            if "编辑遮罩为空" in message:
                code = "VMN_EMPTY_MASK"
            elif "图像和遮罩尺寸不一致" in message:
                code = "VMN_MASK_MISMATCH"
            elif "尺寸上下文与当前图像不匹配" in message:
                code = "VMN_CONTEXT_MISMATCH"
            elif "需要连接 SAM3" in message:
                code = "VMN_SAM_REQUIRED"
            elif "粗选与所述目标没有可靠交集" in message:
                code = "VMN_TARGET_NO_MATCH"
            elif "多个同类目标" in message or "指向不同目标" in message:
                code = "VMN_TARGET_AMBIGUOUS"
            elif "编辑范围为空" in message or "完全覆盖" in message:
                code = "VMN_EMPTY_SCOPE"
            else:
                code = "VMN_SELECTION_FAILED"
            raise ValueError(f"{code}: {message}") from error
        return (plan, padded, noise, prompt, _tensor(plan["preview"]), mask_tensor(plan["allowed"]),
                _tensor(plan["guide_image"]), plan["generation_prompt"])


class VMEditFinish:
    DEV_ONLY = True

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "plan": ("VM_EDIT_PLAN",),
            "run_mode": (RUN_MODES,),
            "filename_prefix": ("STRING", {"default": "VMNodes/Edit"}),
        }, "optional": {
            "generated_pre": ("IMAGE", {"lazy": True}),
            "frontend_session": ("STRING", {"default": ""}),
            "seam_harmonization": (("off", "auto"), {"default": "off"}),
        }, "hidden": {
            "prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID",
        }}

    RETURN_TYPES = ("IMAGE", "MASK", "IMAGE")
    RETURN_NAMES = ("final_image", "allowed_mask", "preview_image")
    FUNCTION = "finish"
    OUTPUT_NODE = True
    CATEGORY = "VMNodes/Internal"

    @classmethod
    def check_lazy_status(cls, plan, run_mode, filename_prefix, generated_pre=_ABSENT, **_kwargs):
        return ["generated_pre"] if run_mode_value(run_mode) == "generate" and generated_pre is None else []

    def finish(self, plan, run_mode, filename_prefix, generated_pre=None, frontend_session="",
               prompt=None, extra_pnginfo=None, unique_id=None, seam_harmonization="off"):
        run_mode = run_mode_value(run_mode)
        mode_value(seam_harmonization)
        harmonization = {"mode": seam_harmonization, "status": "preview_not_run"}
        if run_mode == "preview":
            image = plan["preview"]
            result = (ExecutionBlocker(None), mask_tensor(final_allowed_mask(plan)), _tensor(image))
            stage = "Preview"
        elif run_mode == "generate":
            if generated_pre is None:
                raise ValueError("VMN_PRE_MISSING: 生成分支没有返回 Pre。")
            try:
                final = VMFinalizeEdit().finish(plan, generated_pre, seam_harmonization,
                                               _diagnostics=harmonization)[0]
            except ValueError as error:
                if str(error).startswith("VMN_"):
                    raise
                raise ValueError(f"VMN_COMPOSITE_FAILED: {error}") from error
            image = (final[0].detach().float().cpu().numpy() * 255).round().clip(0, 255).astype("uint8")
            result = (final, mask_tensor(final_allowed_mask(plan)), ExecutionBlocker(None))
            stage = "Final"
        else:
            raise ValueError("Invalid VMNodes run mode.")

        prefix = filename_prefix.rstrip("/\\") + "_" + stage
        directory, name, counter, subfolder, _ = folder_paths.get_save_image_path(
            prefix, folder_paths.get_output_directory(), image.shape[1], image.shape[0])
        target = Path(directory) / f"{name}_{counter:05}_.png"
        pnginfo = PngImagePlugin.PngInfo()
        if prompt is not None:
            pnginfo.add_text("prompt", json.dumps(prompt, ensure_ascii=False))
        if extra_pnginfo:
            for key, value in extra_pnginfo.items():
                pnginfo.add_text(key, json.dumps(value, ensure_ascii=False))
        source = plan.get("image_context")
        source_shape = source["original_rgb"].shape if source else plan["original"].shape
        pnginfo.add_text("vmnodes", json.dumps({"stage": stage, "plan_signature": plan["signature"],
                                                "build": plan.get("build", BUILD),
                                                "backend": plan.get("backend", {}),
                                                "selection": plan.get("selection_evidence", {}),
                                                "guidance_available": plan.get("guidance", {}),
                                                "source_size": [source_shape[1], source_shape[0]],
                                                "seam_harmonization": harmonization,
                                                "node_id": str(unique_id),
                                                "warnings": plan.get("warnings", [])}, ensure_ascii=False))
        Image.fromarray(image).save(target, pnginfo=pnginfo, compress_level=4)
        return {"ui": {"images": [{"filename": target.name, "subfolder": subfolder, "type": "output"}],
                       "vm_stage": [stage], "vm_session": [frontend_session],
                       "vm_selection": [plan.get("selection_evidence", {}).get("route", "")],
                       "vm_seam_status": [harmonization["status"]],
                       "vm_warnings": plan.get("warnings", [])},
                "result": result}
