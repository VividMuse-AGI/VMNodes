"""Small native ComfyUI bridge for coarse selection and exact final PNG output.

No HTTP calls, extra server, project-root imports, or absolute development paths.
"""
import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, PngImagePlugin

import folder_paths

from .core import attachment_owned, dilate, erode, request_hints, paste_band, paste_hair_boundary, pick
from .selection import visual_hint, spatial_candidate, same_instance, extent_consistent, remove_unmarked_components
from ..geometry import mask_array, prepare_work_canvas

POLICY = "vmnodes-boundary-v27-20260925"
_person_model = None


def _rgb(image):
    if image.ndim != 4 or image.shape[0] != 1 or image.shape[-1] < 3:
        raise ValueError("只支持单张 RGB 原图，请拆分批次。")
    return np.rint(np.clip(image[0, :, :, :3].detach().float().cpu().numpy(), 0, 1) * 255).astype(np.uint8)


def _mask(mask, hw):
    if mask.ndim != 3 or mask.shape[0] != 1 or tuple(mask.shape[1:]) != tuple(hw):
        raise ValueError("遮罩尺寸与原图不一致。请在同一 LoadImage 节点上用 Mask Editor 绘制。")
    arr = mask[0].detach().float().cpu().numpy()
    if not np.isfinite(arr).all() or arr.min() < 0 or arr.max() > 1:
        raise ValueError("遮罩值无效。")
    result = arr > .5
    if result.sum() < 4:
        raise ValueError("粗遮罩为空。请在原图上画白色可编辑区域；普通 RGB 图还没有遮罩。")
    return result


def _sha(*arrays, text=""):
    h = hashlib.sha256(POLICY.encode())
    h.update(text.encode("utf-8"))
    for array in arrays:
        h.update(str(array.shape).encode())
        h.update(np.ascontiguousarray(array).tobytes())
    return h.hexdigest()


def _detect(sam_model, sam_clip, image, term):
    from nodes import CLIPTextEncode
    from comfy_extras.nodes_sam3 import SAM3_Detect
    conditioning = CLIPTextEncode().encode(sam_clip, term + ":8")[0]
    result = SAM3_Detect.execute(sam_model, image, conditioning=conditioning,
                                 threshold=.5, refine_iterations=2, individual_masks=True)
    masks = result.result[0].detach().float().cpu().numpy()
    return [np.uint8(m > .5) * 255 for m in masks if np.count_nonzero(m > .5) >= 4]


def _detect_visual(sam_model, image, user, protection):
    from comfy_extras.nodes_sam3 import SAM3_Detect
    hint = visual_hint(user, protection)
    if hint is None:
        return [], {'route':'visual', 'rejected':'protected'}
    x0,y0,x1,y1 = hint['roi']
    px,py = hint['point']
    # A single point on a local crop avoids full-person results from a clothing
    # click. Do not union a separate box result with this point result.
    result = SAM3_Detect.execute(sam_model, image[:,y0:y1,x0:x1,:],
        positive_coords=json.dumps([{'x':px-x0,'y':py-y0}]),
        threshold=.5, refine_iterations=1, individual_masks=True)
    masks=[]
    for m in result.result[0].detach().float().cpu().numpy():
        full=np.zeros(user.shape,bool)
        full[y0:y1,x0:x1]=m>.5
        candidate=spatial_candidate(full,hint,protection)
        if candidate is not None and extent_consistent(candidate, user)[0]:
            masks.append(np.uint8(candidate)*255)
    return masks, {'route':'visual','roi':[x0,y0,x1,y1],'point':[px,py],
                   'bounded':hint['bounded'],'accepted':len(masks)}


def _select_target(sam_model, sam_clip, image, original, user, task, protection):
    target=task['target']
    if target=='visual':
        visual,ev=_detect_visual(sam_model,image,user,protection)
        if not ev.get('bounded'):
            raise ValueError('VMN_SPATIAL_EXTENT: 无法仅凭这段笔迹确定物体范围；请粗略圈出目标轮廓后预览。')
        chosen,reason,support=pick(visual,user,task,original,return_support=True)
        if chosen is None:
            if reason and ('多个同类目标' in reason or '指向不同目标' in reason):
                raise ValueError(reason)
            # A local point may miss a whole person. This optional semantic
            # candidate must fit the same outline, not just intersect a shirt.
            hint=visual_hint(user,protection)
            persons=_detect(sam_model,sam_clip,image,'person')
            visual=[]
            for mask in persons:
                candidate=spatial_candidate(mask>127,hint,protection)
                if candidate is not None:visual.append(np.uint8(candidate)*255)
            chosen,reason,support=pick(visual,user,task,original,return_support=True)
            if chosen is None:
                if reason and ('多个同类目标' in reason or '指向不同目标' in reason):raise ValueError(reason)
                raise ValueError('VMN_TARGET_NOT_FOUND: 未能确认所画位置的目标；请调整圈选范围，或使用所画遮罩并检查范围。')
            ev={**ev,'supplement':'person','accepted':len(visual)}
        return chosen,support,visual,{**ev,'route':'spatial','request_policy':'freeform'}
    masks=_detect(sam_model,sam_clip,image,target)
    chosen,reason,support=pick(masks,user,task,original,return_support=True)
    evidence={'route':'text','term':target}
    incomplete = False
    if chosen is not None:
        consistent, extent = extent_consistent(chosen, user)
        evidence['extent'] = extent
        if not consistent:
            incomplete = True
            chosen = None
            reason = '没有识别到所述目标。'
    # Conflicting instances and explicit left/right requests must not be resolved
    # by silently selecting a different point-driven object.
    may_retry = reason in ('没有识别到所述目标。',
        '粗选与所述目标没有可靠交集；若画的是轮廓，请闭合轮廓或在目标内部补画几笔。')
    may_retry &= target!='person' and not task.get('target_position')
    may_retry &= not any(p.get('category')==target for p in task.get('protected',[]))
    if chosen is None and may_retry:
        visual,ev=_detect_visual(sam_model,image,user,protection)
        candidate,_,visual_support=pick(visual,user,task,original,return_support=True)
        if candidate is not None and ev.get('bounded') and extent_consistent(candidate,user)[0]:
            # Subregions of the same target are not separate protected instances.
            distinct = [m for m in masks if ((m>127)&candidate).sum()/max(1,int((m>127).sum())) < .90]
            return candidate,visual_support,[np.uint8(candidate)*255]+distinct,{
                **ev,'route':'spatial','rejected_text_fragment':incomplete,
                'extent':extent_consistent(candidate,user)[1]}
        # For named clothing, require a broad clothing candidate to corroborate
        # the spatial mask. A point alone can select skin or the whole person.
        if target=='shirt':
            fallback=_detect(sam_model,sam_clip,image,'top')
            text_choice,text_reason,text_support=pick(fallback,user,task,original,return_support=True)
            if text_choice is None and not fallback:
                fallback=_detect(sam_model,sam_clip,image,'jacket')
                text_choice,text_reason,text_support=pick(fallback,user,task,original,return_support=True)
            if text_reason and ('多个同类目标' in text_reason or '指向不同目标' in text_reason):
                raise ValueError(text_reason)
            if candidate is not None and text_choice is not None and same_instance(candidate,text_choice):
                chosen,support=candidate,visual_support
                # Equivalent alternate masks are evidence, not protected objects.
                masks=[np.uint8(chosen)*255]+[m for m in masks+fallback if not same_instance(m>127,chosen)]
                evidence={**ev,'confirmation':'top/jacket'}
            elif text_choice is not None:
                chosen,support=text_choice,text_support
                masks=fallback
                evidence={'route':'text_fallback','term':'top/jacket','visual_rejected':ev}
    if chosen is None:
        if incomplete:
            raise ValueError('VMN_TARGET_INCOMPLETE: 自动选区只覆盖粗选中的很小局部；请改用按粗选范围，或调整轮廓后预览。')
        if may_retry:
            raise ValueError('VMN_TARGET_NOT_FOUND: 未能确认所画位置的目标；请调整圈选范围，或使用所画遮罩并检查范围。')
        raise ValueError(reason)
    consistent, extent = extent_consistent(chosen, user)
    if not consistent:
        raise ValueError('VMN_TARGET_INCOMPLETE: 自动选区只覆盖粗选中的很小局部；请改用按粗选范围，或调整轮廓后预览。')
    evidence['extent'] = extent
    return chosen,support,masks,evidence


def _guard_spatial_person(sam_model,sam_clip,image,original,user,chosen):
    """A free-form name must not bypass the established full-person cross-check.

    Clothing/body parts overlap a person but do not cover most of the person.
    Only whole-person selections request the existing independent YOLO model.
    """
    persons=_detect(sam_model,sam_clip,image,'person')
    for mask in persons:
        person=mask>127
        overlap=int((person & chosen).sum())
        if overlap/max(1,int(person.sum()))>=.60 and overlap/max(1,int(chosen.sum()))>=.65:
            return _check_person(original,user,chosen)
    return None


def _check_person(original, user, chosen):
    """Independent YOLO mask must agree with the SAM instance, as in V7."""
    global _person_model
    from ..optional_dependencies import load_yolo
    folder_paths.add_model_folder_path("ultralytics", os.path.join(folder_paths.models_dir, "ultralytics"))
    path = folder_paths.get_full_path("ultralytics", "segm/person_yolov8m-seg.pt")
    if not path:
        raise ValueError("VMN_PERSON_MODEL_REQUIRED: 缺少人物独立校验模型：models/ultralytics/segm/person_yolov8m-seg.pt")
    if _person_model is None or getattr(_person_model, "_coarse_path", None) != path:
        YOLO = load_yolo(folder_paths.get_user_directory())
        _person_model = YOLO(path)
        _person_model._coarse_path = path
    # Ultralytics treats a NumPy image as BGR, while ComfyUI IMAGE is RGB.
    prediction = _person_model.predict(source=Image.fromarray(original), device="cpu", imgsz=640,
                                       conf=.45, retina_masks=True, verbose=False)[0]
    people = _person_segments(prediction, original.shape[:2], _person_model.names)
    for detected in people:
        user_overlap = int((user & detected).sum())
        user_coverage = user_overlap / max(1, int(detected.sum()))
        concentrated = (user_overlap >= max(32, round(min(user.shape) * .05)) and
                        user_overlap / max(1, int(user.sum())) >= .80)
        if user_coverage < .03 and not concentrated:
            continue
        intersection = int((chosen & detected).sum())
        chosen_coverage = intersection / max(1, int(chosen.sum()))
        iou = intersection / max(1, int((chosen | detected).sum()))
        if chosen_coverage >= .60 and iou >= .30:
            return {"chosen_coverage": chosen_coverage, "iou": iou,
                    "user_coverage": user_coverage,
                    "detected_pixels": int(detected.sum())}
    raise ValueError("VMN_PERSON_CONFLICT: SAM 人物候选与独立人物检测不一致；请预览范围或主动改用按粗选范围。")


def _person_segments(prediction, shape, names):
    """Distinguish missing evidence from malformed segmentation output."""
    boxes = prediction.boxes
    if boxes is None or len(boxes.cls) == 0:
        raise ValueError("VMN_PERSON_UNCONFIRMED: 独立检测没有返回人物实例，无法确认 SAM 人物候选；可主动改用按粗选范围。")
    classes = boxes.cls.detach().cpu().numpy()
    if classes.ndim != 1 or not np.isfinite(classes).all() or np.any(classes != np.rint(classes)):
        raise ValueError("VMN_PERSON_MASK_DATA: 人物检测类别数据无效，已停止自动细化。")
    try:
        indices = [i for i, cls in enumerate(classes) if names[int(cls)] == 'person']
    except (KeyError, IndexError, TypeError):
        raise ValueError("VMN_PERSON_MASK_DATA: 人物检测类别映射无效，已停止自动细化。") from None
    if not indices:
        raise ValueError("VMN_PERSON_UNCONFIRMED: 独立检测没有返回人物实例，无法确认 SAM 人物候选；可主动改用按粗选范围。")
    if prediction.masks is None:
        raise ValueError("VMN_PERSON_MASK_DATA: 人物检测返回了框但没有实例遮罩，已停止自动细化。")
    segments = prediction.masks.data.detach().cpu().numpy()
    if segments.ndim != 3 or len(segments) != len(classes):
        raise ValueError("VMN_PERSON_MASK_DATA: 人物检测框与遮罩数量或维度不一致，已停止自动细化。")
    if segments.shape[-2:] != tuple(shape):
        raise ValueError("VMN_PERSON_MASK_SIZE: 人物实例遮罩尺寸与输入图像不一致，已停止自动细化。")
    if not np.isfinite(segments).all() or np.any((segments < 0) | (segments > 1)):
        raise ValueError("VMN_PERSON_MASK_DATA: 人物实例遮罩包含无效值，已停止自动细化。")
    people = [segments[i] > .5 for i in indices]
    if any(not mask.any() for mask in people):
        raise ValueError("VMN_PERSON_MASK_DATA: 人物实例遮罩为空，已停止自动细化。")
    return people


def _preview(original, allowed, protected, user):
    out = original.astype(np.float32).copy()
    out[allowed] = .65 * out[allowed] + .35 * np.array([30, 200, 180])
    near = protected & dilate(user, max(8, round(min(user.shape) * .03)))
    out[near] = .65 * out[near] + .35 * np.array([60, 100, 255])
    return np.uint8(np.clip(np.rint(out), 0, 255))


def _tensor(rgb):
    return torch.from_numpy(rgb.astype(np.float32) / 255).unsqueeze(0)


class CoarsePlan:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",), "rough_mask": ("MASK",),
            "prompt": ("STRING", {"multiline": True, "default": "把白色上衣改成深红色，保留皮肤、头发和背景。"}),
            "selection_mode": (["粗涂补全目标", "仅改所涂区域", "涂抹修补（填满目标）"],),
            "sam_model": ("MODEL",), "sam_clip": ("CLIP",),
        }}

    RETURN_TYPES = ("COARSE_EDIT_PLAN_V9", "IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("编辑计划", "补边原图", "生成噪声遮罩", "生成需求")
    FUNCTION = "build"
    CATEGORY = "局部编辑/V9"

    def build(self, image, rough_mask, prompt, selection_mode, sam_model, sam_clip,
              canvas_policy="legacy", protect_mask=None, backend="qwen21"):
        original = _rgb(image)
        h, w = original.shape[:2]
        user = _mask(rough_mask, (h, w))
        task = request_hints(prompt)
        if task["target"] == "person" and selection_mode != "粗涂补全目标":
            raise ValueError("人物移除需要独立实例校验，只支持“粗涂补全目标”模式。")
        person_guard = None
        protected = mask_array(protect_mask, (h, w), optional=True)
        protected_full = protected.copy()
        hard_protected = protected.copy()
        auto_hair = np.zeros((h, w), bool)
        diagnostic = {"manual_protect": protected.copy()} if os.environ.get("VM_IMAGE_EDIT_AUDIT") == "1" else None
        warnings = ['text_protection'] if task.get('unresolved_protection') else []
        mode = selection_mode
        selection_evidence = {'route':'drawn_mask'}
        if mode in ("仅改所涂区域", "涂抹修补（填满目标）"):
            support = user.copy()
        else:
            chosen, selection_support, masks, selection_evidence = _select_target(
                sam_model,sam_clip,image,original,user,task,protected)
            if task["target"] == "person":
                person_guard = _check_person(original, selection_support, chosen)
            elif task["target"] == "visual":
                person_guard = (_check_person(original,selection_support,chosen)
                    if selection_evidence.get('supplement')=='person' else
                    _guard_spatial_person(sam_model,sam_clip,image,original,selection_support,chosen))
                selection_evidence['person_guard'] = bool(person_guard)
            support = chosen.copy()
            if diagnostic is not None:
                diagnostic["target_raw"] = chosen.copy()
            radius = max(3, round(min(w, h) * .02))
            others = [m > 127 for m in masks if not np.array_equal(m > 127, chosen)]
            if task["target"] == "person" and task["operation"] == "remove":
                bags = _detect(sam_model, sam_clip, image, "backpack")
                near = dilate(chosen, radius)
                attach = [m > 127 for m in bags if ((m > 127) & near).sum() > 3]
                if len(attach) > 1:
                    raise ValueError("附近有多个背包，无法判断归属。")
                if attach and not attachment_owned(attach[0], chosen, others, radius):
                    raise ValueError("背包可能属于另一人，请确认归属。")
                if attach:
                    support |= attach[0]
            for flag, term in (("shadow", "shadow"), ("clasp", "metal clasp")):
                if not task.get(flag):
                    continue
                found = _detect(sam_model, sam_clip, image, term)
                near = dilate(chosen, radius)
                attach = [m > 127 for m in found if ((m > 127) & near).sum() > 3]
                if len(attach) != 1:
                    raise ValueError("没有可靠识别附属" + term + "，请确认范围。")
                if task["target"] == "person" and not attachment_owned(attach[0], chosen, others, radius):
                    raise ValueError("附属" + term + "可能属于另一人，请确认归属。")
                support |= attach[0]
            if task["operation"] == "remove":
                support = dilate(support, max(2, round(min(w, h) * .003)))
            explicit = {p["category"] for p in task.get("protected", []) if p["category"] and p["category"] != task["target"]}
            defaults = {"shirt": {"hair", "face", "hand"}, "hair": {"face", "hand"},
                        "leash": {"dog", "collar", "tag"}}.get(task["target"], set())
            terms = {"tag": "pet tag"}
            names = {"hair": "头发", "face": "脸", "hand": "手", "dog": "狗", "collar": "项圈", "tag": "圆牌"}
            for category in sorted(explicit | defaults):
                found = _detect(sam_model, sam_clip, image, terms.get(category, category))
                if not found:
                    subject = names.get(category, category)
                    if task["target"] == "person":
                        raise ValueError("VMN_PROTECTION_UNVERIFIED: 无法确认需要保护的" + subject +
                                         "；人物移除请检查目标与保护要求。")
                    if (task["target"] in ("shirt", "hair") and task["operation"] == "recolor") or task['target']=='visual':
                        warnings.append(category)
                        continue
                    raise ValueError("VMN_PROTECTION_UNVERIFIED: 无法确认需要保护的" + subject +
                                     "；请检查图像和保护要求。")
                for m in found:
                    if diagnostic is not None:
                        key = "auto_" + category
                        diagnostic[key] = diagnostic.get(key, np.zeros((h, w), bool)) | (m > 127)
                    if (category == "hair" and category not in explicit and
                            task["target"] == "shirt" and task["operation"] == "recolor"):
                        auto_hair |= m > 127
                    else:
                        hard_protected |= m > 127
                    protected |= erode(m > 127, 3)
                    protected_full |= m > 127
            if task["target"] in ("person", "shirt", "hair"):
                for m in masks:
                    other = m > 127
                    if not np.array_equal(other, chosen):
                        hard_protected |= other
                        protected |= erode(other, 3)
                        protected_full |= other
            if (protected & support).sum() > .4 * support.sum():
                raise ValueError("VMN_PROTECTION_CONFLICT: 保护对象与编辑区域大面积重叠，请检查目标和保护遮罩。")
            support &= ~protected
        if diagnostic is not None:
            diagnostic["support"] = support.copy()
            diagnostic["hard_protected"] = hard_protected.copy()
            diagnostic["auto_hair_union"] = auto_hair.copy()
        if not support.any():
            raise ValueError("编辑区域为空。")
        noise = dilate(support, max(8, round(min(w, h) * .016)))
        boundary = np.zeros((h, w), bool)
        if mode == "粗涂补全目标" and (task['target']=='visual' or
                (task["target"] == "shirt" and task["operation"] == "recolor")):
            cover = max(1, min(4, round(min(w, h) * 2 / 1024)))
            blend = max(1, min(3, round(min(w, h) * 2 / 1024)))
            allowed, alpha = paste_band(support, protected_full, cover, blend)
            if auto_hair.any():
                allowed, alpha, protected_full, boundary = paste_hair_boundary(
                    allowed, alpha, protected_full, auto_hair, hard_protected, original)
                if diagnostic is not None:
                    diagnostic["hair_boundary"] = boundary
        else:
            allowed = support.copy()
            distance = cv2.distanceTransform(support.astype(np.uint8), cv2.DIST_L2, 5)
            alpha = np.rint(np.clip((distance - .5) / 2, 0, 1) * 255).astype(np.uint8)
        alpha[~allowed | protected_full] = 0
        allowed &= ~protected_full
        if mode == "粗涂补全目标":
            filtered = remove_unmarked_components(allowed, user)
            selection_evidence['unmarked_fragment_pixels'] = int((allowed & ~filtered).sum())
            allowed = filtered
            alpha[~allowed] = 0
        if not np.any(allowed & (alpha > 0)):
            raise ValueError("编辑范围被保护对象完全覆盖，请调整粗涂或检查目标。")
        padded, padded_noise, padded_size = prepare_work_canvas(
            original, noise, external=canvas_policy == "external", backend=backend)
        signature = _sha(original, user.astype(np.uint8), allowed.astype(np.uint8), noise.astype(np.uint8),
                         alpha, protected_full.astype(np.uint8), text=prompt + "\n" + mode)
        plan = {"original": original, "user": user, "allowed": allowed,
                "noise": noise, "protected": protected_full, "alpha": alpha,
                "auto_hair": auto_hair, "hair_boundary": boundary,
                "preview": _preview(original, allowed, protected_full, user),
                "signature": signature, "prompt": prompt, "mode": mode,
                "person_guard": person_guard, "warnings": warnings, "selection_evidence": selection_evidence,
                "padded_size": padded_size}
        if diagnostic is not None:
            plan["diagnostic"] = diagnostic
            audit_dir = Path(os.environ.get("VM_IMAGE_EDIT_AUDIT_DIR") or
                             Path(folder_paths.get_user_directory()) / "vmnodes" / "audit")
            audit_dir.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(audit_dir / (signature + "-plan.npz"),
                                original=original, allowed=allowed.astype(np.uint8),
                                protected=protected_full.astype(np.uint8), alpha=alpha,
                                **{key: value.astype(np.uint8) for key, value in diagnostic.items()})
        return plan, _tensor(padded), torch.from_numpy(padded_noise).unsqueeze(0), prompt


class CoarseOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "plan": ("COARSE_EDIT_PLAN_V9",),
            "stage": (["1 预览范围", "2 确认并生成 Final"],),
            "filename_prefix": ("STRING", {"default": "CoarseEdit_V9/Final"}),
        }, "optional": {
            "generated_pre": ("IMAGE", {"lazy": True}),
        }, "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"}}

    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "局部编辑/V9"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    @classmethod
    def check_lazy_status(cls, plan, stage, filename_prefix, generated_pre=None, **kwargs):
        if stage.startswith("2"):
            path = cls._confirmation_path(kwargs.get("unique_id"), plan["signature"])
            if not path.exists():
                raise ValueError("范围尚未确认或已变化。先把阶段设为“1 预览范围”运行，查看输出，再设为“2 确认并生成 Final”。")
            if generated_pre is None:
                return ["generated_pre"]
        return []

    @staticmethod
    def _confirmation_path(unique_id, signature):
        key = hashlib.sha256((str(unique_id) + ":" + signature).encode()).hexdigest()[:32]
        folder = Path(folder_paths.get_user_directory()) / "coarse_edit_v9" / "confirmations"
        folder.mkdir(parents=True, exist_ok=True)
        return folder / (key + ".confirmed")

    @staticmethod
    def _write_audit(plan):
        if os.environ.get("COARSE_EDIT_AUDIT") != "1" or "noise" not in plan:
            return
        folder = Path(folder_paths.get_user_directory()) / "coarse_edit_v9" / "audit"
        folder.mkdir(parents=True, exist_ok=True)
        meta = {"policy": POLICY, "plan_signature": plan["signature"],
                "source_sha256": hashlib.sha256(plan["original"].tobytes()).hexdigest(),
                "source_size": list(plan["original"].shape[1::-1]),
                "padded_size": plan["padded_size"], "prompt": plan["prompt"],
                "mode": plan["mode"], "person_guard": plan["person_guard"]}
        np.savez_compressed(folder / (plan["signature"] + ".npz"),
                            U=plan["user"].astype(np.uint8),
                            A=plan["allowed"].astype(np.uint8),
                            N=plan["noise"].astype(np.uint8),
                            F=plan["alpha"], P=plan["protected"].astype(np.uint8),
                            metadata=np.array(json.dumps(meta, ensure_ascii=False)))

    def save(self, plan, stage, filename_prefix, generated_pre=None,
             prompt=None, extra_pnginfo=None, unique_id=None):
        if stage.startswith("1"):
            result = plan["preview"]
            label = "Preview"
        else:
            if generated_pre is None:
                raise ValueError("生成分支没有返回 Pre。")
            if not self._confirmation_path(unique_id, plan["signature"]).exists():
                raise ValueError("范围确认已失效，Final 未保存。")
            pre = _rgb(generated_pre)
            w, h = plan["original"].shape[1], plan["original"].shape[0]
            if pre.shape[:2] != (plan["padded_size"][1], plan["padded_size"][0]):
                raise ValueError("Pre 与补边网格不一致，拒绝回贴。")
            pre = pre[:h, :w]
            base = plan["original"]
            alpha = plan["alpha"].astype(np.float32)[..., None] / 255
            result = np.rint(base.astype(np.float32) * (1 - alpha) + pre.astype(np.float32) * alpha).astype(np.uint8)
            result[~plan["allowed"] | plan["protected"]] = base[~plan["allowed"] | plan["protected"]]
            label = "Final"
        output_dir = folder_paths.get_output_directory()
        stem = filename_prefix.rstrip("/\\") + "_" + label
        folder, name, counter, subfolder, _ = folder_paths.get_save_image_path(
            stem, output_dir, result.shape[1], result.shape[0])
        path = Path(folder) / f"{name}_{counter:05}_.png"
        info = PngImagePlugin.PngInfo()
        if prompt is not None:
            info.add_text("prompt", json.dumps(prompt, ensure_ascii=False))
        if extra_pnginfo is not None:
            for key, value in extra_pnginfo.items():
                info.add_text(key, json.dumps(value, ensure_ascii=False))
        info.add_text("coarse_edit_v9", json.dumps({"stage": label, "plan_signature": plan["signature"],
                                                     "source_size": list(plan["original"].shape[1::-1]),
                                                     "allowed_pixels": int(plan["allowed"].sum())}, ensure_ascii=False))
        Image.fromarray(result).save(path, pnginfo=info, compress_level=4)
        self._write_audit(plan)
        if stage.startswith("1"):
            self._confirmation_path(unique_id, plan["signature"]).touch()
        return {"ui": {"images": [{"filename": path.name, "subfolder": subfolder, "type": "output"}]}}
