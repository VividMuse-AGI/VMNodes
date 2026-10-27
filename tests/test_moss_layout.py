"""Regression and acceptance tests for VM MOSS Layout Studio (V2).

Covers the design V2 checklist plus the independent audit items F01–F05 and
G01–G03, while keeping the V1 canvas/aspect regressions.

Run: python -m unittest tests.test_moss_layout -v
"""

import json
import math
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

from host import ROOT, package
import vmnodes_test.moss_layout as ML

NODE_ID = "VMMOSSLayoutStudio"
M = package.VMMOSSLayoutStudio

MUG_TEXT = """```json
{
  "width": 1536,
  "height": 1024,
  "bbox_coord_space": "abs",
  "bbox_format": "xyxy",
  "summary": {
    "meta": ["product campaign", "studio photography"],
    "canvas": "single",
    "caption": "A warm studio campaign for a handmade ceramic cup."
  },
  "items": [
    {"label": "object", "caption": "An ivory ceramic cup.", "bbox": [176, 224, 800, 864]},
    {"label": "text", "caption": "Large title.", "text": "把日常，过成诗。", "bbox": [928, 272, 1408, 448]},
    {"label": "text", "caption": "Smaller copy.", "text": "一杯温暖\\n一刻从容", "bbox": [928, 512, 1376, 656]}
  ]
}
```"""


def box(box_id, label, cx, cy, w, h, aspect, lock=True, text="", caption="", visible=True):
    return {"id": box_id, "label": label, "visible": visible, "lock_aspect": lock,
            "cx": cx, "cy": cy, "w": w, "h": h, "orig_aspect": aspect,
            "text": text, "caption": caption}


def layout(boxes, base_w, base_h):
    return json.dumps({"version": 2, "base_width": base_w, "base_height": base_h, "boxes": boxes},
                      ensure_ascii=False)


def run(**kwargs):
    args = dict(
        ui_language="中文 (ZH)",
        canvas_preset=ML.PRESET_CUSTOM,
        width=1024,
        height=1024,
        bbox_ratio_sync=ML.SYNC_SMART,
        scene_meta="poster",
        canvas_layout_type="single",
        layer_order_mode=ML.LAYER_AUTO,
        global_prompt="现代极简科技峰会海报",
        layout_data="{}",
    )
    args.update(kwargs)
    return M().compile_layout(**args)


def prompt_of(out):
    return json.loads(out["result"][0])


def draft_of(out):
    return json.loads(out["result"][1])


def pixels(bbox):
    ymin, xmin, ymax, xmax = bbox
    return xmax - xmin, ymax - ymin


class RegistrationTests(unittest.TestCase):
    def test_node_is_registered_by_feature_module(self):
        self.assertIn(NODE_ID, package.NODE_CLASS_MAPPINGS)
        self.assertEqual(package.NODE_DISPLAY_NAME_MAPPINGS[NODE_ID], "VM MOSS Layout Studio")
        self.assertEqual(package.IMPORT_ERRORS, {})
        # Existing features are unaffected.
        for node_id in ("VMImageResizeAlign", "VMImageEdit", "VMImageEditBridge"):
            self.assertIn(node_id, package.NODE_CLASS_MAPPINGS)

    def test_locales_cover_both_languages_and_every_port(self):
        zh = json.loads((ROOT / "locales/zh/nodeDefs.json").read_text(encoding="utf-8"))[NODE_ID]
        en = json.loads((ROOT / "locales/en/nodeDefs.json").read_text(encoding="utf-8"))[NODE_ID]
        self.assertEqual(zh["display_name"], "VM MOSS 海报布局工作台")
        self.assertEqual(en["display_name"], "VM MOSS Layout Studio")
        schema = M.INPUT_TYPES()
        ports = set(schema["required"]) | set(schema["optional"])
        self.assertEqual(set(zh["inputs"]), ports)
        self.assertEqual(set(en["inputs"]), ports)
        self.assertEqual(set(zh["outputs"]), set(M.RETURN_NAMES))
        self.assertEqual(set(en["outputs"]), set(M.RETURN_NAMES))
        self.assertNotIn("MOSS_BBOX", json.dumps(schema))


class SchemaTests(unittest.TestCase):
    def test_input_contract(self):
        schema = M.INPUT_TYPES()
        self.assertEqual(list(schema["required"]), [
            "ui_language", "canvas_preset", "width", "height", "bbox_ratio_sync", "scene_meta",
            "canvas_layout_type", "layer_order_mode", "global_prompt", "layout_data"])
        self.assertEqual(list(schema["optional"]), [
            "ref_image", "global_prompt_in", "box_texts_in", "external_layout_json",
            "external_sync_mode", "custom_meta_tags"])
        self.assertEqual(M.RETURN_TYPES, ("STRING", "STRING", "IMAGE", "INT", "INT"))
        self.assertEqual(M.RETURN_NAMES, ("layout_prompt", "draft_json", "preview_image", "width", "height"))
        self.assertEqual(M.CATEGORY, "VMNodes/MOSS")
        self.assertTrue(M.OUTPUT_NODE)
        self.assertEqual(schema["required"]["ui_language"][0], ["中文 (ZH)", "English (EN)"])
        self.assertEqual(schema["required"]["canvas_layout_type"][0], ["single", "multi_panel", "collage"])
        self.assertIn("none (不写入 meta)", schema["required"]["scene_meta"][0])
        self.assertTrue(schema["optional"]["external_layout_json"][1]["forceInput"])

    def test_canvas_presets_are_complete_and_sixteen_aligned(self):
        names = [name for name in ML.PRESET_NAMES if name != ML.PRESET_CUSTOM]
        self.assertEqual(len(names), 17)
        self.assertEqual(ML.CANVAS_PRESETS[ML.PRESET_CUSTOM], None)
        for name, size in ML.CANVAS_PRESETS.items():
            if size is None:
                continue
            self.assertEqual(size[0] % 16, 0, name)
            self.assertEqual(size[1] % 16, 0, name)
            self.assertGreaterEqual(min(size), 256, name)
            self.assertLessEqual(max(size), 4096, name)


class AlignmentTests(unittest.TestCase):
    def test_alignment_helper(self):
        self.assertEqual(ML.align16(1001), 1008)
        self.assertEqual(ML.align16(777), 784)
        self.assertEqual(ML.align16(100), 256)
        self.assertEqual(ML.align16(5000), 4096)
        self.assertEqual(ML.align16(1024), 1024)

    def test_linked_size_is_aligned_in_outputs_and_coordinates(self):
        out = run(width=1001, height=777)
        self.assertEqual((out["result"][3], out["result"][4]), (1008, 784))
        self.assertEqual(out["ui"]["resolved_size"][0], [1008, 784])

    def test_preset_wins_while_size_widgets_are_default(self):
        out = run(canvas_preset="Mobile 9:16 Standard (768x1344)", width=896, height=1152)
        self.assertEqual((out["result"][3], out["result"][4]), (768, 1344))

    def test_linked_size_overrides_a_selected_preset(self):
        out = run(canvas_preset="Mobile 9:16 Standard (768x1344)", width=1001, height=777)
        self.assertEqual((out["result"][3], out["result"][4]), (1008, 784))


class CompileTests(unittest.TestCase):
    def test_single_node_contract_and_protocol(self):
        boxes = [
            box("box_1", "text", 0.5, 0.15, 0.8, 0.12, 5.0, True, "AI 开发者大会 2026", "Large bold title"),
            box("box_2", "character", 0.5, 0.55, 0.6, 0.5, 0.94, True, "", "Cyberpunk android"),
            box("box_3", "object", 0.5, 0.5, 0.98, 0.98, 0.98, False, "", "Deep blue background"),
        ]
        out = run(layout_data=layout(boxes, 1024, 1024))
        prompt, draft, image, w, h = out["result"]
        self.assertEqual((w, h), (1024, 1024))
        self.assertEqual(tuple(image.shape), (1, 1024, 1024, 3))
        self.assertEqual(str(image.dtype), "torch.float32")
        data = json.loads(prompt)
        self.assertEqual(set(data), {"summary", "items", "bbox_coord_space", "bbox_format"})
        self.assertEqual(data["bbox_coord_space"], "abs_centralized")
        self.assertEqual(data["bbox_format"], "yxyx")
        self.assertEqual([i["label"] for i in data["items"]], ["object", "character", "text"])
        for item in data["items"]:
            self.assertEqual(len(item["bbox"]), 4)
            self.assertTrue(all(isinstance(v, int) for v in item["bbox"]))
        self.assertNotIn("text", data["items"][0])
        self.assertEqual(data["items"][-1]["text"], "AI 开发者大会 2026")
        self.assertEqual(Path(ROOT / "moss_layout.py").exists(), True)
        self.assertEqual(json.loads(draft)["bbox_format"], "xyxy")

    def test_bbox_encloses_fractional_edges_like_the_official_compiler(self):
        W = H = 1024
        boxes = [box("box_1", "object", 0.5031, 0.4977, 0.3011, 0.2033, 1.5, False, "", "x")]
        out = run(layout_data=layout(boxes, W, H), width=W, height=H)
        x1 = (0.5031 - 0.3011 / 2) * W
        x2 = (0.5031 + 0.3011 / 2) * W
        y1 = (0.4977 - 0.2033 / 2) * H
        y2 = (0.4977 + 0.2033 / 2) * H
        expected = [math.floor(y1) - H // 2, math.floor(x1) - W // 2,
                    math.ceil(y2) - H // 2, math.ceil(x2) - W // 2]
        self.assertEqual(prompt_of(out)["items"][0]["bbox"], expected)

    def test_meta_and_canvas_type(self):
        boxes = [box("box_1", "object", 0.5, 0.5, 0.5, 0.5, 1.0, False, "", "bg")]
        data = prompt_of(run(layout_data=layout(boxes, 1024, 1024), scene_meta="infographic",
                             canvas_layout_type="multi_panel", custom_meta_tags="flat design, editorial"))
        self.assertEqual(data["summary"]["meta"], ["infographic", "flat design", "editorial"])
        self.assertEqual(data["summary"]["canvas"], "multi_panel")

    def test_meta_can_be_disabled(self):
        boxes = [box("box_1", "object", 0.5, 0.5, 0.5, 0.5, 1.0, False, "", "bg")]
        data = prompt_of(run(layout_data=layout(boxes, 1024, 1024), scene_meta=ML.SCENE_META_NONE))
        self.assertNotIn("meta", data["summary"])
        self.assertEqual(data["summary"]["canvas"], "single")

    def test_empty_canvas_falls_back_to_caption(self):
        out = run(global_prompt="  只有一段描述  ")
        self.assertEqual(out["result"][0], "只有一段描述")
        self.assertEqual(draft_of(out)["items"], [])

    def test_hidden_and_degenerate_boxes_are_filtered(self):
        boxes = [box("box_1", "text", 0.5, 0.2, 0.5, 0.1, 5.0, True, "隐藏", "x", visible=False),
                 box("box_2", "object", 0.5, 0.5, 0.004, 0.004, 1.0, False, "", "误触")]
        self.assertEqual(run(layout_data=layout(boxes, 1024, 1024))["result"][0], "现代极简科技峰会海报")

    def test_out_of_canvas_boxes_are_clamped(self):
        boxes = [box("box_1", "object", 0.99, 0.99, 0.5, 0.5, 1.0, False, "", "偏出")]
        bbox = prompt_of(run(layout_data=layout(boxes, 1024, 1024)))["items"][0]["bbox"]
        self.assertTrue(-512 <= bbox[1] < bbox[3] <= 512)
        self.assertTrue(-512 <= bbox[0] < bbox[2] <= 512)

    def test_text_caption_is_generated_in_the_selected_language(self):
        boxes = [box("box_1", "text", 0.5, 0.15, 0.8, 0.1, 7.0, True, "限时 5 折", "")]
        zh = prompt_of(run(layout_data=layout(boxes, 1024, 1024), ui_language="中文 (ZH)"))["items"][0]
        en = prompt_of(run(layout_data=layout(boxes, 1024, 1024), ui_language="English (EN)"))["items"][0]
        self.assertIn("限时 5 折", zh["caption"])
        self.assertTrue(zh["caption"].startswith("清晰可读的排版"))
        self.assertTrue(en["caption"].startswith('Clear, legible typography rendering the text "限时 5 折"'))


class AspectRegressionTests(unittest.TestCase):
    def test_aspect_switch_keeps_locked_square(self):
        boxes = [box("box_1", "character", 0.5, 0.5, 0.4, 0.4, 1.0, True)]
        for mode in (ML.SYNC_KEEP, ML.SYNC_SMART):
            out = run(layout_data=layout(boxes, 1024, 1024),
                      canvas_preset="Mobile 9:16 Standard (768x1344)", width=768, height=1344,
                      bbox_ratio_sync=mode)
            wpx, hpx = pixels(prompt_of(out)["items"][0]["bbox"])
            self.assertLessEqual(abs(wpx - hpx), 1, mode)

    def test_stretch_mode_stretches_unlocked_boxes(self):
        boxes = [box("box_1", "character", 0.5, 0.5, 0.4, 0.4, 1.0, False)]
        out = run(layout_data=layout(boxes, 1024, 1024),
                  canvas_preset="Mobile 9:16 Standard (768x1344)", width=768, height=1344,
                  bbox_ratio_sync=ML.SYNC_STRETCH)
        wpx, hpx = pixels(prompt_of(out)["items"][0]["bbox"])
        self.assertGreater(abs(wpx - hpx), 50)

    def test_auto_and_manual_layer_order(self):
        boxes = [
            box("box_1", "text", 0.5, 0.2, 0.6, 0.1, 6.0, True, "先画的标题"),
            box("box_2", "object", 0.5, 0.5, 0.98, 0.98, 1.0, False, "", "全屏背景"),
            box("box_3", "object", 0.2, 0.8, 0.15, 0.1, 1.5, False, "", "小图标"),
            box("box_4", "character", 0.5, 0.55, 0.4, 0.45, 0.89, True, "", "人物"),
        ]
        auto = prompt_of(run(layout_data=layout(boxes, 1024, 1024), layer_order_mode=ML.LAYER_AUTO))["items"]
        self.assertEqual([i["label"] for i in auto], ["object", "object", "character", "text"])
        self.assertEqual(auto[0]["caption"], "全屏背景")
        manual = prompt_of(run(layout_data=layout(boxes, 1024, 1024), layer_order_mode=ML.LAYER_MANUAL))["items"]
        self.assertEqual([i["label"] for i in manual], ["text", "object", "object", "character"])

    def test_labels_and_captions_never_shift_after_deleting_a_box(self):
        boxes = [box("box_1", "object", 0.5, 0.5, 0.9, 0.9, 1.0, False, "", "背景"),
                 box("box_2", "character", 0.5, 0.5, 0.4, 0.5, 0.8, True, "", "主角"),
                 box("box_3", "text", 0.5, 0.1, 0.7, 0.1, 7.0, True, "标题", "粗体")]
        items = prompt_of(run(layout_data=layout(boxes, 1024, 1024), layer_order_mode=ML.LAYER_MANUAL))["items"]
        self.assertEqual([i["caption"] for i in items], ["背景", "主角", "粗体"])
        items = prompt_of(run(layout_data=layout(boxes[1:], 1024, 1024),
                              layer_order_mode=ML.LAYER_MANUAL))["items"]
        self.assertEqual([i["label"] for i in items], ["character", "text"])
        self.assertEqual([i["caption"] for i in items], ["主角", "粗体"])


class SkillImportTests(unittest.TestCase):
    def test_official_ceramic_cup_example_is_restored_exactly(self):
        out = run(canvas_preset=ML.PRESET_CUSTOM, width=896, height=1152,
                  external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_REPLACE)
        self.assertEqual((out["result"][3], out["result"][4]), (1536, 1024))
        data = prompt_of(out)
        self.assertEqual(data["items"][0]["bbox"], [-288, -592, 352, 32])
        self.assertEqual(data["items"][2]["text"], "一杯温暖\n一刻从容")
        self.assertEqual(data["summary"]["meta"], ["product campaign", "studio photography"])
        self.assertEqual(data["summary"]["canvas"], "single")
        self.assertEqual(draft_of(out)["items"][0]["bbox"], [176, 224, 800, 864])

    def test_synced_layout_data_reports_the_imported_canvas(self):
        out = run(external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_REPLACE)
        synced = json.loads(out["ui"]["synced_layout_data"][0])
        self.assertEqual((synced["base_width"], synced["base_height"]), (1536, 1024))
        self.assertEqual(len(synced["boxes"]), 3)
        self.assertEqual(synced["meta"], ["product campaign", "studio photography"])
        self.assertEqual(synced["canvas"], "single")
        self.assertEqual(out["ui"]["external_kind"][0], "draft")

    def test_draft_round_trip_is_pixel_identical(self):
        first = run(external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_REPLACE)
        draft = first["result"][1]
        second = run(canvas_preset=ML.PRESET_CUSTOM, width=1536, height=1024,
                     layout_data=first["ui"]["synced_layout_data"][0],
                     external_layout_json=draft, external_sync_mode=ML.EXTERNAL_REPLACE)
        self.assertEqual([i["bbox"] for i in prompt_of(second)["items"]],
                         [i["bbox"] for i in prompt_of(first)["items"]])
        self.assertEqual(json.loads(second["result"][1])["items"],
                         json.loads(draft)["items"])

    def test_compiled_prompt_can_be_imported_again(self):
        first = run(external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_REPLACE)
        compiled = first["result"][0]
        again = run(canvas_preset=ML.PRESET_CUSTOM, width=1536, height=1024,
                    external_layout_json=compiled, external_sync_mode=ML.EXTERNAL_REPLACE)
        self.assertEqual([i["bbox"] for i in prompt_of(again)["items"]],
                         [i["bbox"] for i in prompt_of(first)["items"]])

    def test_caption_only_inputs(self):
        boxes = [box("box_1", "object", 0.5, 0.5, 0.4, 0.4, 1.0, False, "", "bg")]
        for payload in ('{"caption": "只有一句话"}', "只有一句话"):
            out = run(layout_data=layout(boxes, 1024, 1024), external_layout_json=payload,
                      external_sync_mode=ML.EXTERNAL_MERGE)
            prompt = prompt_of(out)
            self.assertEqual(prompt["summary"]["caption"], "只有一句话")
            self.assertEqual(len(prompt["items"]), 1)

    def test_caption_only_link_backfills_the_caption_without_touching_boxes(self):
        boxes = [box("box_1", "object", 0.5, 0.5, 0.4, 0.4, 1.0, False, "", "bg")]
        out = run(layout_data=layout(boxes, 1024, 1024),
                  external_layout_json='{"caption": "来自上游的一句话"}',
                  external_sync_mode=ML.EXTERNAL_MERGE)
        self.assertEqual(out["ui"].get("synced_caption"), ["来自上游的一句话"])
        self.assertNotIn("synced_layout_data", out["ui"])
        self.assertEqual(len(prompt_of(out)["items"]), 1)

    def test_unrecognised_json_is_ignored(self):
        out = run(external_layout_json='{"foo": 1}', external_sync_mode=ML.EXTERNAL_REPLACE)
        self.assertEqual((out["result"][3], out["result"][4]), (1024, 1024))

    def test_ignore_mode_keeps_the_canvas(self):
        out = run(external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_IGNORE)
        self.assertEqual((out["result"][3], out["result"][4]), (1024, 1024))
        self.assertNotIn("synced_layout_data", out["ui"])


class AuditFixTests(unittest.TestCase):
    """F01–F04 and G01/G03 from the independent acceptance report."""

    def test_f01_merge_backfills_and_never_duplicates(self):
        first = run(external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_MERGE,
                    canvas_preset="Campaign 3:2 HD (1536x1024)", width=1536, height=1024)
        state = first["ui"]["synced_layout_data"][0]
        self.assertEqual(len(json.loads(state)["boxes"]), 3)
        second = run(layout_data=state, external_layout_json=MUG_TEXT,
                     external_sync_mode=ML.EXTERNAL_MERGE,
                     canvas_preset="Campaign 3:2 HD (1536x1024)", width=1536, height=1024)
        boxes = json.loads(second["ui"]["synced_layout_data"][0])["boxes"]
        self.assertEqual(len(boxes), 3, "re-running must not append duplicates")
        ids = [item["id"] for item in boxes]
        self.assertEqual(len(ids), len(set(ids)))

    def test_f01_local_boxes_survive_a_merge(self):
        local = layout([box("box_1", "object", 0.5, 0.5, 0.9, 0.9, 1.0, False, "", "本地背景")], 896, 1152)
        out = run(layout_data=local, external_layout_json=MUG_TEXT,
                  external_sync_mode=ML.EXTERNAL_MERGE, width=896, height=1152)
        boxes = json.loads(out["ui"]["synced_layout_data"][0])["boxes"]
        self.assertEqual(len(boxes), 4)
        self.assertEqual(boxes[0]["id"], "box_1")
        self.assertIn("本地背景", [b["caption"] for b in boxes])

    def test_f02_cross_size_import_keeps_locked_aspect(self):
        square = json.dumps({
            "width": 1024, "height": 1024, "bbox_coord_space": "abs", "bbox_format": "xyxy",
            "summary": {"caption": "square"}, "items": [{"label": "character", "caption": "hero",
                                                         "bbox": [307, 307, 717, 717]}],
        }, ensure_ascii=False)
        for mode in (ML.SYNC_KEEP, ML.SYNC_SMART):
            out = run(canvas_preset=ML.PRESET_CUSTOM, width=768, height=1344,
                      bbox_ratio_sync=mode, external_layout_json=square,
                      external_sync_mode=ML.EXTERNAL_MERGE)
            wpx, hpx = pixels(prompt_of(out)["items"][0]["bbox"])
            self.assertLessEqual(abs(wpx - hpx), 1, mode)
        # Replace adopts the source canvas, so the square stays 410×410.
        out = run(width=768, height=1344, external_layout_json=square,
                  external_sync_mode=ML.EXTERNAL_REPLACE)
        wpx, hpx = pixels(prompt_of(out)["items"][0]["bbox"])
        self.assertLessEqual(abs(wpx - hpx), 1)
        self.assertEqual(wpx, 410)

    def test_f04_resolved_size_matches_linked_values(self):
        out = run(canvas_preset="Banner 16:9 Standard (1344x768)", width=1001, height=777)
        self.assertEqual(out["ui"]["resolved_size"][0], [1008, 784])
        self.assertEqual((out["result"][3], out["result"][4]), (1008, 784))
        preview = out["result"][2]
        self.assertEqual(tuple(preview.shape[:3]), (1, 784, 1008))

    def test_g01_reference_info_and_preview(self):
        image = torch.from_numpy(np.linspace(0, 1, 1080 * 1440 * 3, dtype=np.float32)
                                 .reshape(1, 1440, 1080, 3))
        out = run(ref_image=image, width=896, height=1152)
        info = out["ui"]["ref_info"][0]
        self.assertEqual(info["size"], [1080, 1440])
        self.assertEqual(info["aligned"], [1088, 1440])
        self.assertTrue(info["thumbnail"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(tuple(out["result"][2].shape[:3]), (1, 1152, 896))

    def test_g03_alignment_is_applied_before_compilation(self):
        out = run(width=1001, height=777,
                  layout_data=layout([box("box_1", "object", 0.5, 0.5, 0.5, 0.5, 1.0, False)], 1001, 777))
        self.assertEqual((out["result"][3], out["result"][4]), (1008, 784))
        bbox = prompt_of(out)["items"][0]["bbox"]
        self.assertTrue(-504 <= bbox[1] < bbox[3] <= 504)
        self.assertTrue(-392 <= bbox[0] < bbox[2] <= 392)


class IndependentReviewRegressionTests(unittest.TestCase):
    def test_repeated_merge_returns_the_authoritative_boxes_after_local_edits(self):
        first = run(external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_MERGE)
        edited = json.loads(first["ui"]["synced_layout_data"][0])
        edited["boxes"][1].update(text="Edited", cx=0.3)
        second = run(layout_data=json.dumps(edited), external_layout_json=MUG_TEXT,
                     external_sync_mode=ML.EXTERNAL_MERGE)
        synced = json.loads(second["ui"]["synced_layout_data"][0])
        self.assertEqual(synced["boxes"][1]["text"], "把日常，过成诗。")
        from_canvas = run(layout_data=json.dumps(synced), external_sync_mode=ML.EXTERNAL_IGNORE)
        self.assertEqual(prompt_of(from_canvas)["items"], prompt_of(second)["items"])

    def test_fractional_draft_round_trips_do_not_change_compiled_edges(self):
        original = run(layout_data=layout([
            box("fractional", "object", 0.5031, 0.4977, 0.3011, 0.2033, 1.5, False, "", "shape")
        ], 1024, 1024))
        expected = prompt_of(original)["items"]
        self.assertEqual(expected[0]["bbox"], [-107, -151, 102, 158])
        self.assertTrue(any(v != int(v) for v in draft_of(original)["items"][0]["bbox"]))
        current = original
        for _ in range(5):
            current = run(external_layout_json=current["result"][1],
                          external_sync_mode=ML.EXTERNAL_REPLACE)
            self.assertEqual(prompt_of(current)["items"], expected)
            self.assertEqual(draft_of(current)["items"], draft_of(original)["items"])

    def test_palette_survives_import_canvas_only_and_state_reload(self):
        payload = json.loads(ML.strip_fences(MUG_TEXT))
        palette = ["#112233", "#abcdef"]
        payload["summary"]["palette"] = palette
        payload["items"][0]["palette"] = ["#eeeeee"]
        first = run(external_layout_json=json.dumps(payload))
        state_text = first["ui"]["synced_layout_data"][0]
        self.assertEqual(json.loads(state_text)["palette"], palette)
        for state in (state_text, json.dumps(ML.parse_layout_data(state_text, 1536, 1024))):
            out = run(width=1536, height=1024, layout_data=state, external_sync_mode=ML.EXTERNAL_IGNORE)
            self.assertEqual(draft_of(out)["summary"]["palette"], palette)
            self.assertEqual(prompt_of(out)["summary"]["palette"], palette)
            self.assertEqual(draft_of(out)["items"][0]["palette"], ["#eeeeee"])
        self.assertEqual(prompt_of(first)["summary"]["palette"], palette)

    def test_empty_draft_keeps_summary_palette_and_canvas(self):
        payload = {"width": 768, "height": 1344, "items": [],
                   "summary": {"caption": "empty", "meta": ["infographic"],
                               "canvas": "multi_panel", "palette": ["#112233"]}}
        out = run(external_layout_json=json.dumps(payload))
        self.assertEqual(draft_of(out)["summary"], payload["summary"])
        state = json.loads(out["ui"]["synced_layout_data"][0])
        self.assertEqual(state["palette"], ["#112233"])

    def test_empty_layout_replace_clears_boxes_and_adopts_source_size(self):
        existing = layout([box("old", "text", 0.5, 0.5, 0.5, 0.1, 5.0, True, "Old", "title")],
                          1024, 1024)
        for space, fmt in (("abs", "xyxy"), ("abs_centralized", "yxyx")):
            for summary in ({}, {"caption": "empty"}):
                with self.subTest(space=space, summary=summary):
                    payload = {"width": 768, "height": 1344, "bbox_coord_space": space,
                               "bbox_format": fmt, "summary": summary, "items": []}
                    out = run(layout_data=existing, external_layout_json=json.dumps(payload),
                              external_sync_mode=ML.EXTERNAL_REPLACE)
                    self.assertEqual(out["result"][3:], (768, 1344))
                    self.assertEqual(draft_of(out)["items"], [])
                    self.assertEqual(json.loads(out["ui"]["synced_layout_data"][0])["boxes"], [])

    def test_empty_layout_merge_keeps_existing_boxes(self):
        existing = layout([box("local", "object", 0.5, 0.5, 0.4, 0.4, 1, False, "", "shape")],
                          1024, 1024)
        out = run(layout_data=existing, external_layout_json='{"items": [], "width": 768, "height": 1344}',
                  external_sync_mode=ML.EXTERNAL_MERGE)
        self.assertEqual(out["result"][3:], (1024, 1024))
        self.assertEqual(len(prompt_of(out)["items"]), 1)
        self.assertEqual(json.loads(out["ui"]["synced_layout_data"][0])["boxes"][0]["id"], "local")

    def test_invalid_nonempty_layout_with_caption_does_not_clear_canvas(self):
        existing = layout([box("local", "object", 0.5, 0.5, 0.4, 0.4, 1, False, "", "shape")],
                          1024, 1024)
        payload = json.dumps({"width": 768, "height": 1344,
                              "summary": {"caption": "invalid incoming layout"},
                              "items": [{"label": "object", "bbox": []}]})
        self.assertIsNone(ML.parse_skill_json(payload, 1024, 1024))
        out = run(layout_data=existing, external_layout_json=payload,
                  external_sync_mode=ML.EXTERNAL_REPLACE, global_prompt="keep caption")
        self.assertEqual(out["result"][3:], (1024, 1024))
        self.assertEqual(len(prompt_of(out)["items"]), 1)
        self.assertEqual(prompt_of(out)["summary"]["caption"], "keep caption")
        self.assertNotIn("synced_layout_data", out["ui"])

    def test_layout_import_clears_empty_summary_fields_in_replace_and_merge(self):
        old_state = json.loads(layout([
            box("local", "object", 0.5, 0.5, 0.4, 0.4, 1, False, "", "shape")
        ], 1024, 1024))
        old_state.update(caption="old caption", meta=["poster"], palette=["#123456"], canvas="collage")
        payload = json.dumps({"width": 768, "height": 1344, "items": [],
                              "summary": {"caption": "", "meta": [], "palette": []}})
        for mode in (ML.EXTERNAL_REPLACE, ML.EXTERNAL_MERGE):
            with self.subTest(mode=mode):
                out = run(layout_data=json.dumps(old_state), external_layout_json=payload,
                          external_sync_mode=mode, global_prompt="old caption", scene_meta="poster",
                          custom_meta_tags="old extra tag", canvas_layout_type="collage")
                state = json.loads(out["ui"]["synced_layout_data"][0])
                self.assertEqual(state["caption"], "")
                self.assertEqual(state["meta"], [])
                self.assertEqual(state["palette"], [])
                self.assertEqual(state["canvas"], "collage")
                restored = ML.parse_layout_data(json.dumps(state), state["base_width"], state["base_height"])
                self.assertEqual(restored["caption"], "")
                self.assertEqual(restored["meta"], [])
                self.assertEqual(restored["palette"], [])
                self.assertEqual(draft_of(out)["summary"], {"caption": "", "canvas": "collage"})
                if mode == ML.EXTERNAL_REPLACE:
                    self.assertEqual(out["result"][0], "")
                    self.assertEqual(state["boxes"], [])
                else:
                    self.assertEqual(len(state["boxes"]), 1)
                    self.assertEqual(prompt_of(out)["summary"], {"caption": "", "canvas": "collage"})

    def test_caption_replace_still_preserves_existing_boxes(self):
        existing = layout([box("local", "object", 0.5, 0.5, 0.4, 0.4, 1, False, "", "shape")],
                          1024, 1024)
        out = run(layout_data=existing, external_layout_json='{"caption":"new caption"}',
                  external_sync_mode=ML.EXTERNAL_REPLACE)
        self.assertEqual(len(prompt_of(out)["items"]), 1)
        self.assertEqual(out["ui"]["synced_caption"], ["new caption"])
        self.assertNotIn("synced_layout_data", out["ui"])

    def test_caption_input_preserves_meta_palette_and_canvas(self):
        state = json.loads(layout([
            box("local", "object", 0.5, 0.5, 0.4, 0.4, 1, False, "", "shape")
        ], 1024, 1024))
        state.update(meta=["poster"], palette=["#123456"], canvas="collage")
        out = run(layout_data=json.dumps(state), external_layout_json='{"caption":"new caption"}',
                  external_sync_mode=ML.EXTERNAL_REPLACE, canvas_layout_type="collage")
        self.assertEqual(prompt_of(out)["summary"], {"caption": "new caption", "meta": ["poster"],
                                                      "canvas": "collage", "palette": ["#123456"]})

    def test_reference_removal_sends_explicit_clear(self):
        with_ref = run(ref_image=torch.zeros((1, 256, 384, 3)))
        self.assertEqual(with_ref["ui"]["ref_info"][0]["size"], [384, 256])
        self.assertEqual(run()["ui"]["ref_info"], [None])

    def test_merge_uses_final_preset_dimensions_for_import_geometry(self):
        out = run(canvas_preset="Mobile 9:16 Standard (768x1344)", width=896, height=1152,
                  external_layout_json=MUG_TEXT, external_sync_mode=ML.EXTERNAL_MERGE)
        expected = ML.parse_skill_json(MUG_TEXT, 768, 1344, ML.SYNC_SMART)
        state = json.loads(out["ui"]["synced_layout_data"][0])
        for actual, wanted in zip(state["boxes"], expected["boxes"]):
            for field in ("cx", "cy", "w", "h"):
                self.assertAlmostEqual(actual[field], wanted[field], places=12)


@unittest.skipUnless(shutil.which("node"), "Node.js is required for cross-language parity")
class FrontendParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        source = (ROOT / "web/moss_layout_studio.js").read_text(encoding="utf-8")
        source = source.replace(
            'import { app } from "../../../scripts/app.js";',
            "const app = { registerExtension() {} };")
        cls.module = Path(cls.tmp.name) / "moss.mjs"
        cls.module.write_text(source, encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def _run_node(self, body, payload):
        script = Path(self.tmp.name) / "run.mjs"
        script.write_text(
            f"import * as m from {json.dumps(self.module.as_uri())};\n"
            "import fs from 'node:fs';\n"
            "const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));\n"
            f"{body}\n",
            encoding="utf-8")
        cases = Path(self.tmp.name) / "cases.json"
        cases.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        proc = subprocess.run(["node", str(script), str(cases)], capture_output=True,
                              text=True, encoding="utf-8")
        self.assertEqual(proc.returncode, 0, proc.stderr[-800:])
        return json.loads(proc.stdout)

    def test_aspect_sync_matches_python(self):
        cases = [
            (1024, 1024, 768, 1344, {"label": "character", "cx": 0.5, "cy": 0.5, "w": 0.4, "h": 0.4,
                                     "orig_aspect": 1.0, "lock_aspect": True}),
            (896, 1152, 1344, 768, {"label": "text", "cx": 0.3, "cy": 0.12, "w": 0.8, "h": 0.1,
                                    "orig_aspect": 5.185, "lock_aspect": True}),
            (1024, 1024, 768, 1344, {"label": "object", "cx": 0.5, "cy": 0.5, "w": 0.9, "h": 0.9,
                                     "orig_aspect": 1.0, "lock_aspect": False}),
            (896, 1152, 768, 1344, {"label": "character", "cx": 0.98, "cy": 0.5, "w": 0.3, "h": 0.4,
                                    "orig_aspect": 0.75, "lock_aspect": False}),
        ]
        modes = [ML.SYNC_SMART, ML.SYNC_KEEP, ML.SYNC_STRETCH]
        payload = [{"W0": c[0], "H0": c[1], "W1": c[2], "H1": c[3], "box": c[4]} for c in cases]
        js = self._run_node(
            "const modes = " + json.dumps(modes) + ";\n"
            "console.log(JSON.stringify(data.flatMap((c) => modes.map((mode) => "
            "m.syncBoxAspectRatio(c.box, c.W0, c.H0, c.W1, c.H1, mode)))));", payload)
        expected = []
        for case in cases:
            for mode in modes:
                cx, cy, w, h = ML.sync_box_aspect_ratio(case[4], case[0], case[1], case[2], case[3], mode)
                expected.append({"cx": cx, "cy": cy, "w": w, "h": h})
        worst = max(abs(a[k] - b[k]) for a, b in zip(expected, js) for k in ("cx", "cy", "w", "h"))
        self.assertLess(worst, 1e-12)

    def test_alignment_midpoints_match_python(self):
        values = [100, 256, 264, 280, 777, 1001, 1032, 1064, 4088, 4096, 5000]
        js = self._run_node("console.log(JSON.stringify(data.map(m.alignedSize)));", values)
        self.assertEqual([ML.align16(1032), ML.align16(1064)], [1024, 1056])
        self.assertEqual(js, [ML.align16(v) for v in values])

    def test_fractional_draft_edges_match_python(self):
        state = json.loads(layout([
            box("fractional", "object", 0.5031, 0.4977, 0.3011, 0.2033, 1.5, False, "", "shape")
        ], 1024, 1024))
        js = self._run_node(
            "console.log(JSON.stringify(m.buildDraftJson(data,1024,1024,"
            "{caption:'scene',layerOrder:m.LAYER_AUTO,lang:'en'}).items));", state)
        py = draft_of(run(layout_data=json.dumps(state)))["items"]
        self.assertEqual(js, py)

    def test_skill_import_and_draft_export_match_python(self):
        payload = {"text": MUG_TEXT, "W": 1536, "H": 1024}
        js = self._run_node(
            "const parsed = m.parseSkillJson(data.text, data.W, data.H, m.SYNC_KEEP);\n"
            "const state = m.normalizeState({version:2, base_width:data.W, base_height:data.H, boxes:parsed.boxes}, data.W, data.H);\n"
            "const draft = m.buildDraftJson(state, data.W, data.H, {caption: parsed.caption, meta: parsed.meta,"
            " canvas: parsed.canvas, palette: [], layerOrder: m.LAYER_MANUAL, lang: 'en'});\n"
            "console.log(JSON.stringify({ids: parsed.boxes.map((b) => b.id), draft}));", payload)
        parsed = ML.parse_skill_json(MUG_TEXT, 1536, 1024, ML.SYNC_KEEP)
        self.assertEqual(js["ids"], [b["id"] for b in parsed["boxes"]])
        py_out = run(ui_language="English (EN)", canvas_preset="Campaign 3:2 HD (1536x1024)",
                     width=1536, height=1024, external_layout_json=MUG_TEXT,
                     external_sync_mode=ML.EXTERNAL_REPLACE, global_prompt="cup")
        py_draft = json.loads(py_out["result"][1])
        self.assertEqual(js["draft"]["items"], py_draft["items"])
        self.assertEqual(js["draft"]["summary"]["meta"], py_draft["summary"]["meta"])

    def test_frontend_suite_passes(self):
        proc = subprocess.run(["node", str(ROOT / "tests/moss_frontend.cjs")],
                              capture_output=True, text=True, encoding="utf-8", cwd=str(ROOT))
        self.assertEqual(proc.returncode, 0, (proc.stdout + proc.stderr)[-1200:])
        self.assertIn("checks passed", proc.stdout)


class FinalCompiledBoundaryTests(unittest.TestCase):
    @staticmethod
    def payload(bbox, **size):
        return json.dumps(dict(size, bbox_coord_space="abs_centralized", bbox_format="yxyx",
                               items=[{"label": "object", "caption": "cup", "bbox": bbox}]))

    def test_missing_dimensions_reject_each_outside_edge(self):
        for bbox in ([-513, -100, 100, 100], [-100, -513, 100, 100],
                     [-100, -100, 513, 100], [-100, -100, 100, 513]):
            with self.subTest(bbox=bbox), self.assertRaisesRegex(ValueError, "width/height"):
                ML.parse_skill_json(self.payload(bbox), 1024, 1024)

    def test_missing_dimensions_accept_exact_boundary(self):
        raw = self.payload([-512, -512, 512, 512])
        self.assertEqual(prompt_of(run(external_layout_json=raw))["items"][0]["bbox"], [-512, -512, 512, 512])

    def test_explicit_source_dimensions_allow_cross_canvas_import(self):
        parsed = ML.parse_skill_json(self.payload([-288, -592, 352, 32], width=1536, height=1024), 768, 1344)
        self.assertEqual((parsed["width"], parsed["height"]), (1536, 1024))
        self.assertEqual(len(parsed["boxes"]), 1)

    def test_partial_or_null_source_dimensions_validate_missing_axis(self):
        for size, bbox in (({"width": 1536}, [-513, -592, 352, 32]),
                           ({"height": 1024}, [-288, -592, 352, 32]),
                           ({"width": None}, [-288, -592, 352, 32])):
            with self.subTest(size=size), self.assertRaisesRegex(ValueError, "width/height"):
                ML.parse_skill_json(self.payload(bbox, **size), 1024, 1024)

    def test_external_replace_and_merge_reject_instead_of_clipping(self):
        for mode in (ML.EXTERNAL_REPLACE, ML.EXTERNAL_MERGE):
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "width/height"):
                run(external_layout_json=self.payload([-288, -592, 352, 32]), external_sync_mode=mode)

    def test_ignore_does_not_parse_rejected_external_layout(self):
        out = run(external_layout_json=self.payload([-288, -592, 352, 32]),
                  external_sync_mode=ML.EXTERNAL_IGNORE, global_prompt="local caption")
        self.assertEqual(out["result"][0], "local caption")

    def test_missing_dimensions_use_resolved_preset(self):
        out = run(canvas_preset="Campaign 3:2 HD (1536x1024)", width=896, height=1152,
                  external_layout_json=self.payload([-288, -592, 352, 32]))
        self.assertEqual(prompt_of(out)["items"][0]["bbox"], [-288, -592, 352, 32])


if __name__ == "__main__":
    unittest.main()


class V21PaletteAndPreviewTests(unittest.TestCase):
    """V2.1 §3–§4: palette plumbing and the preview swatches that mirror it."""

    @staticmethod
    def _count(image, color, region=None):
        arr = np.round(image.numpy()[0] * 255).astype(int)
        height, width = arr.shape[:2]
        x1, y1, x2, y2 = region or (0, 0, width, height)
        patch = arr[y1:y2, x1:x2]
        return int((np.abs(patch - np.array(color)).sum(axis=-1) <= 6).sum())

    def test_parse_color_accepts_hex_shorthand_and_names(self):
        self.assertEqual(ML.parse_color("#0F172A"), (15, 23, 42))
        self.assertEqual(ML.parse_color("#abc"), (170, 187, 204))
        self.assertEqual(ML.parse_color("0F172A"), (15, 23, 42))
        self.assertEqual(ML.parse_color(" ivory "), (255, 255, 240))
        self.assertEqual(ML.parse_color("Sky Blue"), (135, 206, 235))
        self.assertIsNone(ML.parse_color("warm gold"))
        self.assertIsNone(ML.parse_color(""))

    def test_palette_reaches_layout_prompt_and_draft(self):
        boxes = [box("box_1", "text", 0.5, 0.2, 0.8, 0.1, 8.0, True, "标题", "title")]
        state = json.loads(layout(boxes, 896, 1152))
        state["palette"] = ["#0F172A", "#38BDF8"]
        state["boxes"][0]["palette"] = ["#F59E0B"]
        out = run(layout_data=json.dumps(state, ensure_ascii=False), width=896, height=1152)

        prompt = prompt_of(out)
        self.assertEqual(prompt["summary"]["palette"], ["#0F172A", "#38BDF8"])
        self.assertEqual(prompt["items"][0]["palette"], ["#F59E0B"])
        draft = draft_of(out)
        self.assertEqual(draft["summary"]["palette"], ["#0F172A", "#38BDF8"])
        self.assertEqual(draft["items"][0]["palette"], ["#F59E0B"])

    def test_palette_string_in_layout_data_is_normalised(self):
        state = json.loads(layout([box("box_1", "object", 0.5, 0.5, 0.4, 0.4, 1.0, False)], 896, 1152))
        state["palette"] = "#0F172A, #38BDF8，ivory"
        out = run(layout_data=json.dumps(state, ensure_ascii=False), width=896, height=1152)
        self.assertEqual(prompt_of(out)["summary"]["palette"], ["#0F172A", "#38BDF8", "ivory"])

    def test_preview_paints_global_and_per_box_swatches(self):
        boxes = [box("box_1", "text", 0.5, 0.2, 0.8, 0.1, 8.0, True, "标题", "title")]
        state = json.loads(layout(boxes, 896, 1152))
        state["palette"] = ["#FF00FF", "#00FF7F"]
        state["boxes"][0]["palette"] = ["#FFFF00", "#00FFFF"]
        out = run(layout_data=json.dumps(state, ensure_ascii=False), width=896, height=1152)
        image = out["result"][2]
        height = image.shape[1]
        # Global swatches live in the bottom status bar, right aligned.
        self.assertGreater(self._count(image, (255, 0, 255), (0, height - 60, 896, height)), 100)
        self.assertGreater(self._count(image, (0, 255, 127), (0, height - 60, 896, height)), 100)
        # Per-box swatches sit next to the tag chip in the upper area.
        self.assertGreater(self._count(image, (255, 255, 0), (0, 0, 896, 300)), 60)
        self.assertGreater(self._count(image, (0, 255, 255), (0, 0, 896, 300)), 60)

    def test_preview_without_palette_has_no_swatch_pixels(self):
        boxes = [box("box_1", "object", 0.5, 0.5, 0.4, 0.4, 1.0, False)]
        out = run(layout_data=layout(boxes, 896, 1152), width=896, height=1152)
        image = out["result"][2]
        height = image.shape[1]
        for color in ((255, 0, 255), (0, 255, 127), (255, 255, 0), (0, 255, 255)):
            self.assertEqual(self._count(image, color, (0, height - 60, 896, height)), 0)

    def test_hide_all_degrades_to_the_global_caption(self):
        boxes = [box("box_1", "text", 0.5, 0.2, 0.8, 0.1, 8.0, True, "标题", "title", visible=False),
                 box("box_2", "character", 0.5, 0.6, 0.5, 0.4, 0.87, True, "", "hero", visible=False),
                 box("box_3", "object", 0.5, 0.5, 0.98, 0.98, 0.76, False, "", "bg", visible=False)]
        caption = "只保留全局描述"
        out = run(layout_data=layout(boxes, 896, 1152), width=896, height=1152, global_prompt=caption)
        self.assertEqual(out["result"][0], caption)
        self.assertEqual(draft_of(out)["items"], [])
        # No box outline survives in the preview either.
        self.assertEqual(self._count(out["result"][2], (74, 144, 255)), 0)

    def test_hidden_box_keeps_its_palette_when_the_state_is_parsed(self):
        boxes = [box("box_1", "text", 0.5, 0.2, 0.8, 0.1, 8.0, True, "标题", "title", visible=False)]
        state = json.loads(layout(boxes, 896, 1152))
        state["boxes"][0]["palette"] = ["#9333EA"]
        raw = json.dumps(state, ensure_ascii=False)
        self.assertEqual(ML.parse_layout_data(raw, 896, 1152)["boxes"][0]["palette"], ["#9333EA"])
        out = run(layout_data=raw, width=896, height=1152)
        # Everything hidden -> caption-only prompt, but the editor state is intact.
        self.assertEqual(out["result"][0], "现代极简科技峰会海报")
        self.assertEqual(draft_of(out)["items"], [])


class V23ExternalTextTests(unittest.TestCase):
    """V2.3 §4: global_prompt_in / box_texts_in ports and their UI payloads."""

    @staticmethod
    def _boxes():
        return [
            box("box_1", "text", 0.5, 0.10, 0.80, 0.08, 10.0, True, "旧标题", "旧样式"),
            box("box_2", "character", 0.5, 0.45, 0.50, 0.40, 0.87, True, "", "旧角色"),
            box("box_3", "text", 0.5, 0.80, 0.70, 0.07, 9.0, True, "旧副标题", ""),
            box("box_4", "object", 0.5, 0.50, 0.98, 0.98, 0.76, False, "", "旧背景"),
        ]

    def test_optional_ports_are_declared_as_forced_inputs(self):
        optional = M.INPUT_TYPES()["optional"]
        for name in ("global_prompt_in", "box_texts_in"):
            self.assertIn(name, optional)
            spec = optional[name]
            self.assertEqual(spec[0], "STRING")
            self.assertTrue(spec[1].get("forceInput"), name)
            self.assertTrue(spec[1].get("tooltip"), name)

    def test_global_prompt_in_overrides_caption_and_syncs_the_widget(self):
        out = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                  global_prompt="widget 里的旧描述", global_prompt_in="外部连入的新描述")
        self.assertEqual(prompt_of(out)["summary"]["caption"], "外部连入的新描述")
        self.assertEqual(draft_of(out)["summary"]["caption"], "外部连入的新描述")
        self.assertEqual(out["ui"].get("synced_caption"), ["外部连入的新描述"])

    def test_empty_global_prompt_in_keeps_the_widget_caption(self):
        out = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                  global_prompt="保留我", global_prompt_in="   ")
        self.assertEqual(prompt_of(out)["summary"]["caption"], "保留我")
        self.assertNotIn("synced_caption", out["ui"])
        self.assertNotIn("synced_layout_data", out["ui"])

    def test_labelled_mode_writes_text_caption_and_descriptions(self):
        out = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                  box_texts_in="\n".join([
                      "T1: 主标题 | 白色粗体居中",
                      "C1: 赛博朋克女性机器人，蓝紫轮廓光",
                      "O1: 深蓝色网格背景",
                      "T2: 副标题二",
                  ]))
        boxes = json.loads(out["ui"]["synced_layout_data"][0])["boxes"]
        self.assertEqual((boxes[0]["text"], boxes[0]["caption"]), ("主标题", "白色粗体居中"))
        self.assertEqual(boxes[1]["caption"], "赛博朋克女性机器人，蓝紫轮廓光")
        self.assertEqual(boxes[3]["caption"], "深蓝色网格背景")
        self.assertEqual((boxes[2]["text"], boxes[2]["caption"]), ("副标题二", ""))
        texts = [item.get("text") for item in prompt_of(out)["items"] if item["label"] == "text"]
        self.assertIn("主标题", texts)
        self.assertIn("副标题二", texts)

    def test_positional_mode_fills_text_boxes_in_order(self):
        out = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                  box_texts_in="第一行标题\n第二行副标题 | 细体小字")
        boxes = json.loads(out["ui"]["synced_layout_data"][0])["boxes"]
        self.assertEqual(boxes[0]["text"], "第一行标题")
        self.assertEqual(boxes[1]["text"], "")            # character untouched
        self.assertEqual(boxes[2]["text"], "第二行副标题")
        self.assertEqual(boxes[2]["caption"], "细体小字")
        self.assertEqual(boxes[1]["caption"], "旧角色")    # positional lines never hit C/O

    def test_escaped_newlines_are_decoded(self):
        out = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                  box_texts_in="T1: 第一行\\n第二行")
        boxes = json.loads(out["ui"]["synced_layout_data"][0])["boxes"]
        self.assertEqual(boxes[0]["text"], "第一行\n第二行")

    def test_unknown_tags_and_comments_are_ignored(self):
        out = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                  box_texts_in="# 说明行\nX9: 不存在\nT1: 有效标题")
        boxes = json.loads(out["ui"]["synced_layout_data"][0])["boxes"]
        self.assertEqual(boxes[0]["text"], "有效标题")
        self.assertEqual(boxes[1]["caption"], "旧角色")
        self.assertEqual(boxes[3]["caption"], "旧背景")

    def test_unchanged_text_link_does_not_resync_the_canvas(self):
        state = layout(self._boxes(), 1152, 896)   # deliberately stale canvas
        first = run(layout_data=state, width=896, height=1152, box_texts_in="T1: 同样的标题")
        self.assertIn("synced_layout_data", first["ui"])
        settled = self._boxes()
        settled[0]["text"] = "同样的标题"
        second = run(layout_data=layout(settled, 896, 1152), width=896, height=1152,
                     box_texts_in="T1: 同样的标题")
        self.assertNotIn("synced_layout_data", second["ui"])
        self.assertEqual(prompt_of(second)["summary"]["caption"], "现代极简科技峰会海报")

    def test_box_texts_override_an_imported_layout(self):
        external = {
            "width": 896, "height": 1152, "bbox_coord_space": "abs", "bbox_format": "xyxy",
            "summary": {"caption": "导入的全局描述"},
            "items": [
                {"label": "text", "caption": "导入样式", "text": "导入标题", "bbox": [80, 80, 800, 180]},
                {"label": "object", "caption": "导入背景", "bbox": [10, 10, 880, 1140]},
            ],
        }
        out = run(width=896, height=1152,
                  external_layout_json=json.dumps(external, ensure_ascii=False),
                  external_sync_mode=ML.EXTERNAL_REPLACE,
                  box_texts_in="T1: 连线覆盖标题 | 连线样式",
                  global_prompt_in="连线全局描述")
        prompt = prompt_of(out)
        texts = [item.get("text") for item in prompt["items"] if item["label"] == "text"]
        self.assertEqual(texts, ["连线覆盖标题"])
        self.assertEqual(prompt["summary"]["caption"], "连线全局描述")

    def test_connected_box_text_is_authoritative_after_local_edit(self):
        first = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                    box_texts_in="T1: 外部标题")
        edited = json.loads(first["ui"]["synced_layout_data"][0])
        edited["boxes"][0]["text"] = "本地改字"
        second = run(layout_data=json.dumps(edited, ensure_ascii=False), width=896, height=1152,
                     box_texts_in="T1: 外部标题")
        self.assertEqual(json.loads(second["ui"]["synced_layout_data"][0])["boxes"][0]["text"], "外部标题")

    def test_edit_after_backfill_survives_when_only_global_text_is_connected(self):
        first = run(layout_data=layout(self._boxes(), 896, 1152), width=896, height=1152,
                    global_prompt_in="外部全局描述")
        edited = json.loads(first["ui"]["synced_layout_data"][0])
        edited["boxes"][0].update(text="手动第一行\n第二行", caption="手动样式")
        second = run(layout_data=json.dumps(edited, ensure_ascii=False), width=896, height=1152,
                     global_prompt_in="外部全局描述")
        for value in (prompt_of(second), draft_of(second)):
            item = next(i for i in value["items"] if i.get("text") == "手动第一行\n第二行")
            self.assertEqual(item["caption"], "手动样式")
