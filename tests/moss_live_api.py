"""Live ComfyUI checks for VM MOSS Layout Studio (not picked up by unittest).

Start ComfyUI with this package loaded, then:

    COMFY_BASE=http://127.0.0.1:8188 python tests/moss_live_api.py

It exercises real graph wiring: external JSON through PrimitiveString, linked
width/height through PrimitiveInt, and the `ui` payload that feeds onExecuted.
"""

import json
import os
import sys
import time
import urllib.request

BASE = os.environ.get("COMFY_BASE", "http://127.0.0.1:8199")
NODE = "VMMOSSLayoutStudio"
OUT = os.environ.get("MOSS_TEST_OUT", os.path.join(os.path.dirname(__file__), "live_out"))
os.makedirs(OUT, exist_ok=True)

MUG = {
    "width": 1536, "height": 1024, "bbox_coord_space": "abs", "bbox_format": "xyxy",
    "summary": {"meta": ["product campaign", "studio photography"], "canvas": "single",
                "caption": "A warm studio campaign for a handmade ceramic cup."},
    "items": [
        {"label": "object", "caption": "An ivory ceramic cup.", "bbox": [176, 224, 800, 864]},
        {"label": "text", "caption": "Large title.", "text": "把日常，过成诗。", "bbox": [928, 272, 1408, 448]},
        {"label": "text", "caption": "Smaller copy.", "text": "一杯温暖\n一刻从容", "bbox": [928, 512, 1376, 656]},
    ],
}

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def api(path, payload=None):
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode())


def run(prompt):
    response = api("/prompt", {"prompt": prompt, "client_id": "vm-moss-live"})
    prompt_id = response["prompt_id"]
    for _ in range(180):
        history = api(f"/history/{prompt_id}")
        if prompt_id in history:
            entry = history[prompt_id]
            if entry.get("status", {}).get("completed") or entry.get("outputs"):
                return entry
        time.sleep(1)
    raise TimeoutError("prompt did not finish")


def studio(inputs, extra=None):
    base = {
        "ui_language": "English (EN)",
        "canvas_preset": "Poster 3:4 Standard (896x1152)",
        "width": 896,
        "height": 1152,
        "bbox_ratio_sync": "Smart (文字/主体保比例，背景铺满)",
        "scene_meta": "poster",
        "canvas_layout_type": "single",
        "layer_order_mode": "Auto (背景->物体->角色->文字置顶)",
        "global_prompt": "live test",
        "layout_data": "{}",
    }
    base.update(inputs)
    prompt = {
        "1": {"class_type": NODE, "inputs": base},
        "2": {"class_type": "ShowText|pysssss", "inputs": {"text": ["1", 0]}},
        "3": {"class_type": "ShowText|pysssss", "inputs": {"text": ["1", 1]}},
        "4": {"class_type": "PreviewImage", "inputs": {"images": ["1", 2]}},
        "5": {"class_type": "SomethingToString", "inputs": {"input": ["1", 3]}},
        "6": {"class_type": "SomethingToString", "inputs": {"input": ["1", 4]}},
        "22": {"class_type": "ShowText|pysssss", "inputs": {"text": ["5", 0]}},
        "23": {"class_type": "ShowText|pysssss", "inputs": {"text": ["6", 0]}},
    }
    if extra:
        prompt.update(extra)
    return prompt


def save_image(entry, node_id, name):
    images = entry.get("outputs", {}).get(node_id, {}).get("images") or []
    if not images:
        return None
    info = images[0]
    query = f"?filename={info['filename']}&subfolder={info.get('subfolder','')}&type={info.get('type','output')}"
    with urllib.request.urlopen(BASE + "/view" + query, timeout=30) as response:
        payload = response.read()
    path = os.path.join(OUT, f"{name}.png")
    with open(path, "wb") as handle:
        handle.write(payload)
    return path


def output_json(entry, node_id):
    return json.loads(entry["outputs"][node_id]["text"][0])


def main():
    print(f"Live checks against {BASE}")

    print("\n[L1] 基础运行与五路输出")
    entry = run(studio({}))
    outputs = entry["outputs"]
    ui = outputs.get("1", {})
    prompt_text = (outputs.get("2", {}).get("text") or [""])[0]
    draft_text = (outputs.get("3", {}).get("text") or [""])[0]
    width_text = (outputs.get("22", {}).get("text") or [""])[0]
    height_text = (outputs.get("23", {}).get("text") or [""])[0]
    check("layout_prompt 为纯文本（空画布）", prompt_text == "live test", prompt_text[:40])
    check("width/height 输出 896/1152", (width_text, height_text) == ("896", "1152"),
          f"{width_text}/{height_text}")
    check("ui.resolved_size 存在", ui.get("resolved_size") == [[896, 1152]], str(ui.get("resolved_size")))
    check("draft_json 可解析", isinstance(json.loads(draft_text), dict))

    print("\n[L2] PrimitiveString 连线导入（Replace）")
    external = json.dumps(MUG, ensure_ascii=False)
    entry = run(studio({}, {
        "7": {"class_type": "PrimitiveString", "inputs": {"value": external}},
        "8": {"class_type": NODE, "inputs": {
            "ui_language": "English (EN)", "canvas_preset": "Poster 3:4 Standard (896x1152)",
            "width": 896, "height": 1152,
            "bbox_ratio_sync": "Smart (文字/主体保比例，背景铺满)", "scene_meta": "poster",
            "canvas_layout_type": "single", "layer_order_mode": "Auto (背景->物体->角色->文字置顶)",
            "global_prompt": "live test", "layout_data": "{}",
            "external_layout_json": ["7", 0],
            "external_sync_mode": "Replace Canvas (用外部 JSON 覆盖画布并回填)",
        }},
        "9": {"class_type": "ShowText|pysssss", "inputs": {"text": ["8", 0]}},
        "10": {"class_type": "PreviewImage", "inputs": {"images": ["8", 2]}},
        "20": {"class_type": "SomethingToString", "inputs": {"input": ["8", 3]}},
        "21": {"class_type": "SomethingToString", "inputs": {"input": ["8", 4]}},
        "24": {"class_type": "ShowText|pysssss", "inputs": {"text": ["20", 0]}},
        "25": {"class_type": "ShowText|pysssss", "inputs": {"text": ["21", 0]}},
    }))
    outputs = entry["outputs"]
    text = (outputs.get("9", {}).get("text") or [""])[0]
    data = json.loads(text)
    check("Replace 采用源画布 1536×1024",
          (outputs.get("24", {}).get("text"), outputs.get("25", {}).get("text")) == (["1536"], ["1024"]),
          str((outputs.get("24", {}).get("text"), outputs.get("25", {}).get("text"))))
    check("陶瓷杯 bbox 精确 [-288,-592,352,32]",
          data["items"][0]["bbox"] == [-288, -592, 352, 32], str(data["items"][0]["bbox"]))
    ui8 = outputs.get("8", {})
    check("onExecuted 载荷 synced_layout_data", bool(ui8.get("synced_layout_data")), "present")
    synced = json.loads(ui8["synced_layout_data"][0])
    check("回填状态含 3 个框且基准为 1536×1024",
          len(synced["boxes"]) == 3 and (synced["base_width"], synced["base_height"]) == (1536, 1024),
          f'{len(synced["boxes"])} / {synced["base_width"]}x{synced["base_height"]}')
    check("回填状态保留 meta 与 canvas", synced.get("meta") == ["product campaign", "studio photography"]
          and synced.get("canvas") == "single", str(synced.get("meta")))
    path = save_image(entry, "10", "l2_replace")
    check("预览图已生成", path and os.path.getsize(path) > 5000, path)

    print("\n[L3] PrimitiveInt 连线宽高（F04）")
    entry = run(studio({}, {
        "11": {"class_type": "PrimitiveInt", "inputs": {"value": 1001}},
        "12": {"class_type": "PrimitiveInt", "inputs": {"value": 777}},
        "13": {"class_type": NODE, "inputs": {
            "ui_language": "English (EN)", "canvas_preset": "Custom (自定义宽高 / Custom W×H)",
            "width": ["11", 0], "height": ["12", 0],
            "bbox_ratio_sync": "Smart (文字/主体保比例，背景铺满)", "scene_meta": "poster",
            "canvas_layout_type": "single", "layer_order_mode": "Auto (背景->物体->角色->文字置顶)",
            "global_prompt": "linked size", "layout_data": "{}",
        }},
        "14": {"class_type": "SomethingToString", "inputs": {"input": ["13", 3]}},
        "15": {"class_type": "SomethingToString", "inputs": {"input": ["13", 4]}},
        "26": {"class_type": "ShowText|pysssss", "inputs": {"text": ["14", 0]}},
        "27": {"class_type": "ShowText|pysssss", "inputs": {"text": ["15", 0]}},
    }))
    outputs = entry["outputs"]
    check("连线宽高被对齐为 1008×784",
          (outputs.get("26", {}).get("text"), outputs.get("27", {}).get("text")) == (["1008"], ["784"]),
          str((outputs.get("26", {}).get("text"), outputs.get("27", {}).get("text"))))
    check("resolved_size 回传连线尺寸",
          outputs.get("13", {}).get("resolved_size") == [[1008, 784]],
          str(outputs.get("13", {}).get("resolved_size")))

    print("\n[L4] 参考图信息（G01）")
    entry = run(studio({"ref_image": ["16", 0]}, {
        "16": {"class_type": "EmptyImage", "inputs": {"width": 1080, "height": 1440, "batch_size": 1, "color": 8421504}},
    }))
    info = (entry["outputs"].get("1", {}).get("ref_info") or [None])[0]
    check("ref_info 回传原始尺寸", info and info["size"] == [1080, 1440], str(info and info["size"]))
    check("ref_info 回传 16 对齐建议", info and info["aligned"] == [1088, 1440], str(info and info["aligned"]))
    check("ref_info 含 Base64 缩略图",
          bool(info and str(info.get("thumbnail", "")).startswith("data:image/jpeg;base64,")))
    path = save_image(entry, "4", "l4_ref_preview")
    check("带底图的预览图已生成", path and os.path.getsize(path) > 5000, path)

    print("\n[L5] 归零：Ignore 模式不覆盖画布")
    entry = run(studio({}, {
        "17": {"class_type": "PrimitiveString", "inputs": {"value": external}},
        "18": {"class_type": NODE, "inputs": {
            "ui_language": "中文 (ZH)", "canvas_preset": "Poster 3:4 Standard (896x1152)",
            "width": 896, "height": 1152,
            "bbox_ratio_sync": "Smart (文字/主体保比例，背景铺满)", "scene_meta": "poster",
            "canvas_layout_type": "single", "layer_order_mode": "Auto (背景->物体->角色->文字置顶)",
            "global_prompt": "ignore test", "layout_data": "{}",
            "external_layout_json": ["17", 0], "external_sync_mode": "Ignore (仅使用画布)",
        }},
        "19": {"class_type": "SomethingToString", "inputs": {"input": ["18", 3]}},
        "28": {"class_type": "ShowText|pysssss", "inputs": {"text": ["19", 0]}},
    }))
    check("Ignore 保持 896×1152",
          entry["outputs"].get("28", {}).get("text") == ["896"],
          str(entry["outputs"].get("28", {}).get("text")))
    check("Ignore 不回填 synced_layout_data",
          "synced_layout_data" not in entry["outputs"].get("18", {}))

    print("\n[L6] R02：真实连线中点取整")
    entry = run(studio({
        "canvas_preset": "Custom (自定义宽高 / Custom W×H)",
        "width": ["30", 0], "height": ["31", 0],
    }, {
        "30": {"class_type": "PrimitiveInt", "inputs": {"value": 1032}},
        "31": {"class_type": "PrimitiveInt", "inputs": {"value": 1064}},
    }))
    outputs = entry["outputs"]
    check("1032×1064 的输出采用中点取偶 1024×1056",
          (outputs["22"]["text"], outputs["23"]["text"]) == (["1024"], ["1056"]),
          str((outputs["22"]["text"], outputs["23"]["text"])))
    check("中点取整后的回填尺寸与输出一致",
          outputs["1"].get("resolved_size") == [[1024, 1056]])

    print("\n[L7] R03：小数框 Draft 往返")
    fractional = {
        "version": 2, "base_width": 1024, "base_height": 1024,
        "boxes": [{"id": "fractional", "label": "object", "visible": True,
                   "lock_aspect": False, "cx": 0.5031, "cy": 0.4977,
                   "w": 0.3011, "h": 0.2033, "orig_aspect": 1.5,
                   "text": "", "caption": "fractional edges"}],
    }
    first = run(studio({
        "canvas_preset": "Custom (自定义宽高 / Custom W×H)", "width": 1024, "height": 1024,
        "layout_data": json.dumps(fractional),
    }))
    first_prompt = output_json(first, "2")
    first_draft = output_json(first, "3")
    check("小数框直接编译使用外包络",
          first_prompt["items"][0]["bbox"] == [-107, -151, 102, 158],
          str(first_prompt["items"][0]["bbox"]))
    second = run(studio({"external_layout_json": ["30", 0]}, {
        "30": {"class_type": "PrimitiveString", "inputs": {"value": json.dumps(first_draft)}},
    }))
    check("小数 Draft 再经真实连线导入后 bbox 零漂移",
          output_json(second, "2")["items"][0]["bbox"] == first_prompt["items"][0]["bbox"],
          str(output_json(second, "2")["items"][0]["bbox"]))

    print("\n[L8] R04：palette 导入、回填后切 Ignore")
    colored = json.loads(json.dumps(MUG))
    colored["summary"]["palette"] = ["#112233", "#abcdef"]
    colored["items"][0]["palette"] = ["#fff1de"]
    colored_text = json.dumps(colored, ensure_ascii=False)
    imported = run(studio({"external_layout_json": ["30", 0]}, {
        "30": {"class_type": "PrimitiveString", "inputs": {"value": colored_text}},
    }))
    imported_state = json.loads(imported["outputs"]["1"]["synced_layout_data"][0])
    expected_palette = colored["summary"]["palette"]
    check("外部导入的 compiled、draft 与回填保留 summary.palette",
          output_json(imported, "2")["summary"].get("palette") == expected_palette
          and output_json(imported, "3")["summary"].get("palette") == expected_palette
          and imported_state.get("palette") == expected_palette)
    canvas_only = run(studio({
        "canvas_preset": "Custom (自定义宽高 / Custom W×H)", "width": 1536, "height": 1024,
        "layout_data": json.dumps(imported_state, ensure_ascii=False),
        "external_sync_mode": "Ignore (仅使用画布)",
        "external_layout_json": ["30", 0],
    }, {"30": {"class_type": "PrimitiveString", "inputs": {"value": colored_text}}}))
    check("回填状态切 Ignore 后两个输出继续保留 summary.palette",
          output_json(canvas_only, "2")["summary"].get("palette") == expected_palette
          and output_json(canvas_only, "3")["summary"].get("palette") == expected_palette)
    check("item.palette 在画布重载编译后仍保留",
          output_json(canvas_only, "2")["items"][0].get("palette") == ["#fff1de"]
          and output_json(canvas_only, "3")["items"][0].get("palette") == ["#fff1de"])

    print("\n[L9] R01：Merge 手动修改后上游优先且输出与回填一致")
    edited = json.loads(json.dumps(imported_state))
    edited["boxes"][1]["text"] = "locally edited title"
    edited["boxes"][1]["cx"] -= 0.1
    merged = run(studio({
        "canvas_preset": "Custom (自定义宽高 / Custom W×H)", "width": 1536, "height": 1024,
        "layout_data": json.dumps(edited, ensure_ascii=False),
        "external_sync_mode": "Merge into Canvas (追加到当前画布并回填)",
        "external_layout_json": ["30", 0],
    }, {"30": {"class_type": "PrimitiveString", "inputs": {"value": colored_text}}}))
    merged_state = json.loads(merged["outputs"]["1"]["synced_layout_data"][0])
    title = next(b for b in merged_state["boxes"] if b["id"] == edited["boxes"][1]["id"])
    check("Merge 同 ID 导入框恢复上游内容并回填同一位置",
          title["text"] == imported_state["boxes"][1]["text"]
          and title["cx"] == imported_state["boxes"][1]["cx"]
          and output_json(merged, "2")["items"] == output_json(imported, "2")["items"])
    check("Merge 回填没有重复 ID 或重复框",
          len(merged_state["boxes"]) == 3
          and len({b["id"] for b in merged_state["boxes"]}) == 3)

    print("\n[L10] R05：空 Draft 与 Compiled 的 Replace")
    for space, fmt in (("abs", "xyxy"), ("abs_centralized", "yxyx")):
        empty = {"width": 832, "height": 1216, "bbox_coord_space": space, "bbox_format": fmt,
                 "summary": {"caption": "", "palette": ["#123456"]}, "items": []}
        cleared = run(studio({
            "layout_data": json.dumps(imported_state, ensure_ascii=False),
            "external_layout_json": ["30", 0],
            "external_sync_mode": "Replace Canvas (用外部 JSON 覆盖画布并回填)",
        }, {"30": {"class_type": "PrimitiveString", "inputs": {"value": json.dumps(empty)}}}))
        cleared_ui = cleared["outputs"]["1"]
        cleared_state = json.loads(cleared_ui["synced_layout_data"][0])
        check(f"{space} 空 Replace 清空旧框并输出空 Draft",
              cleared_state["boxes"] == [] and output_json(cleared, "3")["items"] == [])
        check(f"{space} 空 Replace 采用源尺寸并保留 palette",
              cleared_ui.get("resolved_size") == [[832, 1216]]
              and (cleared_state["base_width"], cleared_state["base_height"]) == (832, 1216)
              and output_json(cleared, "3")["summary"].get("palette") == ["#123456"])

    print("\n[L11] R06：没有参考图时显式清理 UI 载荷")
    no_ref = run(studio({"global_prompt": "reference disconnected"}))
    check("无参考图运行返回 ref_info=[null]",
          no_ref["outputs"]["1"].get("ref_info") == [None])

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    with open(os.path.join(OUT, "checks.json"), "w", encoding="utf-8") as handle:
        json.dump({"base": BASE, "passed": passed, "total": len(RESULTS),
                   "checks": [{"name": name, "ok": ok, "detail": detail}
                              for name, ok, detail in RESULTS]}, handle, ensure_ascii=False, indent=2)
    print(f"\n合计：{passed}/{len(RESULTS)} 通过")
    if passed != len(RESULTS):
        for name, ok, detail in RESULTS:
            if not ok:
                print("  失败:", name, detail)
        return 1
    print("Live checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
