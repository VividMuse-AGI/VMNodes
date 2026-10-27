/**
 * Browser E2E for VM MOSS Layout Studio (ComfyUI 1.57 + Chrome).
 *
 * Run: NODE_PATH=<playwright-core> node tests/moss_ui_e2e.js
 * Requires ComfyUI on COMFY_BASE (default http://127.0.0.1:8199) with VMNodes.
 */

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = process.env.COMFY_BASE || "http://127.0.0.1:8199";
const OUT = process.env.MOSS_UI_OUT || path.join(__dirname, "ui_out");
fs.mkdirSync(OUT, { recursive: true });

const MUG = {
  width: 1536, height: 1024, bbox_coord_space: "abs", bbox_format: "xyxy",
  summary: {
    meta: ["product campaign", "studio photography"], canvas: "single",
    caption: "A warm studio campaign for a handmade ceramic cup.",
  },
  items: [
    { label: "object", caption: "An ivory ceramic cup.", bbox: [176, 224, 800, 864] },
    { label: "text", caption: "Large title.", text: "把日常，过成诗。", bbox: [928, 272, 1408, 448] },
    { label: "text", caption: "Smaller copy.", text: "一杯温暖\n一刻从容", bbox: [928, 512, 1376, 656] },
  ],
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

const stateOf = (page) => page.evaluate(() => {
  const widget = window.__n.widgets.find((w) => w.name === "layout_data");
  return JSON.parse(widget.value || "{}");
});

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio, null, { timeout: 90000 });
  await page.waitForTimeout(1200);

  // Fresh isolated ComfyUI profiles can open the release-notes dialog.
  for (const name of ["关闭对话框", "Close dialog"]) {
    const close = page.getByRole("button", { name, exact: true });
    if (await close.count()) await close.click();
  }

  console.log("\n[U1] 节点挂载与默认中文界面");
  const mount = await page.evaluate(async () => {
    const app = window.comfyAPI.app.app;
    app.graph.clear();
    await new Promise((r) => setTimeout(r, 300));
    const n = window.LiteGraph.createNode("VMMOSSLayoutStudio");
    n.pos = [40, 40];
    app.graph.add(n);
    app.canvas.ds.scale = 0.78;
    app.canvas.ds.offset = [416, 110];
    app.canvas.setDirty(true, true);
    window.__n = n;
    await new Promise((r) => setTimeout(r, 1500));
    const root = document.querySelector(".vmmoss");
    return {
      hasUI: !!root,
      hasCanvas: !!root?.querySelector("canvas.vmmoss-canvas"),
      widgets: n.widgets.map((w) => w.name),
      size: [...n.size],
      labels: Object.fromEntries(n.widgets.slice(0, 10).map((w) => [w.name, w.label || null])),
      langValue: n.widgets.find((w) => w.name === "ui_language").value,
      guides: { ...n._vmmoss.S.guides },
      buttons: [...root.querySelectorAll(".vmmoss-btn")].map((b) => b.textContent),
    };
  });
  check("DOM 画布挂载", mount.hasUI && mount.hasCanvas);
  check("12 个后端 widget + 1 个 DOM widget（IMAGE/forceInput 不是 widget）",
    mount.widgets.length === 13 && mount.widgets.includes("vmmoss_ui") &&
    !mount.widgets.includes("ref_image") && !mount.widgets.includes("external_layout_json"),
    mount.widgets.join(","));
  check("默认语言为中文", mount.langValue === "中文 (ZH)");
  check("工具栏为中文", mount.buttons.some((b) => b === "+ 文字框") && mount.buttons.includes("等高"), mount.buttons.join(" / "));
  check("顶部 [中文 | EN] 开关存在",
    mount.buttons.some((b) => b.replace(/\s/g, "") === "中文|EN"), mount.buttons.join(" / "));
  check("native widget 标签已本地化", mount.labels.canvas_preset === "尺寸预设", JSON.stringify(mount.labels));
  check("新节点默认开启三分线、关闭黄金线", mount.guides.thirds && !mount.guides.golden,
    JSON.stringify(mount.guides));

  console.log("\n[U2] 中英文实时切换");
  const beforeZh = await page.evaluate(() => ({
    title: window.__n.title,
    label: window.__n.widgets.find((w) => w.name === "scene_meta").label,
  }));
  await page.evaluate(() => {
    const langBtn = [...document.querySelectorAll(".vmmoss-btn")]
      .find((b) => b.textContent.replace(/\s/g, "") === "中文|EN");
    langBtn.click();
  });
  await page.waitForTimeout(400);
  const afterEn = await page.evaluate(() => {
    const n = window.__n;
    const root = document.querySelector(".vmmoss");
    return {
      title: n.title,
      lang: n.widgets.find((w) => w.name === "ui_language").value,
      label: n.widgets.find((w) => w.name === "scene_meta").label,
      buttons: [...root.querySelectorAll(".vmmoss-btn")].map((b) => b.textContent),
      rows: [...root.querySelectorAll(".vmmoss-row .vmmoss-sel option")].map((o) => o.textContent),
      empty: root.querySelector(".vmmoss-empty")?.textContent || "",
      foot: root.querySelector(".vmmoss-foot")?.textContent || "",
    };
  });
  check("ui_language 切到 English", afterEn.lang === "English (EN)", afterEn.lang);
  check("节点标题切到英文", afterEn.title === "VM MOSS Layout Studio", afterEn.title);
  check("widget 标签切到英文", afterEn.label === "Medium / Genre", afterEn.label);
  check("工具栏切到英文", afterEn.buttons.includes("+ Text") && afterEn.buttons.includes("Match H"),
    afterEn.buttons.join(" / "));
  check("空状态与状态栏切到英文",
    /No boxes/.test(afterEn.empty) && /Canvas/.test(afterEn.foot), afterEn.empty.slice(0, 30));
  check("切换未破坏中文原标题", beforeZh.title.includes("中文") || beforeZh.title.includes("海报"),
    beforeZh.title);

  await page.evaluate(() => {
    [...document.querySelectorAll(".vmmoss-btn")]
      .find((b) => b.textContent.replace(/\s/g, "") === "中文|EN").click();
  });
  await page.waitForTimeout(300);
  const backZh = await page.evaluate(() => window.__n.widgets.find((w) => w.name === "ui_language").value);
  check("再次点击切回中文", backZh === "中文 (ZH)", backZh);

  console.log("\n[U3] 📥 导入 Skill JSON（覆盖画布）");
  await page.getByRole("button", { name: "📥 导入 JSON" }).click();
  await page.waitForSelector(".vmmoss-modal textarea", { timeout: 5000 });
  await page.fill(".vmmoss-modal textarea", JSON.stringify(MUG));
  await page.getByRole("button", { name: "覆盖画布" }).click();
  await page.waitForTimeout(600);
  const imported = await page.evaluate(() => {
    const n = window.__n;
    const get = (name) => n.widgets.find((w) => w.name === name).value;
    const canvas = document.querySelector(".vmmoss canvas");
    return {
      state: JSON.parse(get("layout_data")),
      width: get("width"), height: get("height"), preset: get("canvas_preset"),
      meta: get("scene_meta"), tags: get("custom_meta_tags"), canvas: get("canvas_layout_type"),
      caption: get("global_prompt"),
      rows: document.querySelectorAll(".vmmoss-row").length,
      view: [canvas.clientWidth, canvas.clientHeight],
      modalOpen: !!document.querySelector(".vmmoss-modal"),
    };
  });
  check("画布尺寸还原为 1536×1024",
    imported.width === 1536 && imported.height === 1024 && imported.preset.startsWith("Custom"),
    `${imported.width}×${imported.height} / ${imported.preset}`);
  check("3 个框与 3 行图层", imported.state.boxes.length === 3 && imported.rows === 3,
    `${imported.state.boxes.length}/${imported.rows}`);
  check("全局描述与体裁还原",
    imported.caption.startsWith("A warm studio campaign") && imported.meta === "product campaign" &&
    imported.tags === "studio photography" && imported.canvas === "single",
    `${imported.meta} | ${imported.tags} | ${imported.canvas}`);
  check("画布视口比例 = 1536/1024",
    Math.abs(imported.view[0] / imported.view[1] - 1536 / 1024) < 0.02,
    `${imported.view[0]}×${imported.view[1]}`);
  check("导入成功后关闭弹窗", imported.modalOpen === false);

  console.log("\n[U4] 📤 导出 Draft JSON");
  await page.getByRole("button", { name: "📤 导出 Draft" }).click();
  await page.waitForSelector(".vmmoss-modal textarea", { timeout: 5000 });
  const exported = await page.evaluate(() => JSON.parse(document.querySelector(".vmmoss-modal textarea").value));
  check("导出草稿为 abs/xyxy 且 3 个框",
    exported.bbox_coord_space === "abs" && exported.bbox_format === "xyxy" && exported.items.length === 3,
    `${exported.bbox_coord_space}/${exported.bbox_format}/${exported.items.length}`);
  check("导出坐标与官方示例一致",
    JSON.stringify(exported.items[0].bbox) === "[176,224,800,864]", JSON.stringify(exported.items[0].bbox));
  check("导出保留换行文字", exported.items[2].text === "一杯温暖\n一刻从容",
    JSON.stringify(exported.items[2].text));
  await page.locator('.vmmoss-modal').getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForTimeout(200);

  console.log("\n[U5] F05 命中顺序 = 输出层级");
  const hit = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.state = {
      version: 2, base_width: 896, base_height: 1152, boxes: [
        { id: "txt", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.5, w: 0.6, h: 0.2, orig_aspect: 2.33, text: "TOP", caption: "" },
        { id: "bg", label: "object", visible: true, lock_aspect: false, cx: 0.5, cy: 0.5, w: 0.98, h: 0.98, orig_aspect: 0.76, text: "", caption: "bg" },
      ],
    };
    const preset = n.widgets.find((w) => w.name === "canvas_preset");
    preset.value = "Poster 3:4 Standard (896x1152)";
    preset.callback(preset.value);
    n._vmmoss.commit(); n._vmmoss.rebuildRows(); n._vmmoss.draw();
    const canvas = document.querySelector(".vmmoss canvas");
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.waitForTimeout(300);
  await page.mouse.click(hit.x, hit.y);
  await page.waitForTimeout(250);
  const selAuto = await page.evaluate(() => window.__n._vmmoss.S.sel);
  check("Auto：重叠处优先命中文字框", selAuto === "txt", String(selAuto));

  await page.evaluate(async () => {
    const n = window.__n;
    const order = n.widgets.find((w) => w.name === "layer_order_mode");
    order.value = "Manual (严格按列表手动顺序)";
    order.callback(order.value);
    n._vmmoss.rebuildRows(); n._vmmoss.draw();
  });
  await page.mouse.click(hit.x, hit.y);
  await page.waitForTimeout(250);
  const selManual = await page.evaluate(() => window.__n._vmmoss.S.sel);
  check("Manual：后画的背景在上、命中背景", selManual === "bg", String(selManual));

  console.log("\n[U6] F03 锁定框最小尺寸 32×8");
  const minInfo = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.state = {
      version: 2, base_width: 1024, base_height: 1024, boxes: [
        { id: "wide", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.5, w: 0.4, h: 0.1, orig_aspect: 4, text: "4:1", caption: "" },
      ],
    };
    const preset = n.widgets.find((w) => w.name === "canvas_preset");
    preset.value = "Square 1:1 Standard (1024x1024)";
    preset.callback(preset.value);
    S.sel = "wide";
    n._vmmoss.commit(); n._vmmoss.rebuildRows(); n._vmmoss.draw();
    const canvas = document.querySelector(".vmmoss canvas");
    const rect = canvas.getBoundingClientRect();
    const px = (v) => rect.x + rect.width * v;
    const py = (v) => rect.y + rect.height * v;
    return { se: [px(0.7005), py(0.5505)], anchor: [px(0.3), py(0.45)] };
  });
  await page.waitForTimeout(250);
  await page.mouse.move(minInfo.se[0], minInfo.se[1]);
  await page.mouse.down();
  await page.mouse.move(minInfo.anchor[0] + 1, minInfo.anchor[1] + 1, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const shrunk = (await stateOf(page)).boxes[0];
  check("按比例缩到最小：32×8 px",
    Math.abs(shrunk.w * 1024 - 32) <= 0.5 && Math.abs(shrunk.h * 1024 - 8) <= 0.5,
    `${(shrunk.w * 1024).toFixed(2)}×${(shrunk.h * 1024).toFixed(2)}`);
  check("锁定框未退化为 1:1",
    Math.abs((shrunk.w * 1024) / (shrunk.h * 1024) - 4) < 0.01,
    ((shrunk.w * 1024) / (shrunk.h * 1024)).toFixed(3));

  console.log("\n[U7] G02 等高 / 等宽对齐");
  const aligned = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.state = {
      version: 2, base_width: 1024, base_height: 1024, boxes: [
        { id: "a", label: "text", visible: true, lock_aspect: true, cx: 0.3, cy: 0.3, w: 0.2, h: 0.1, orig_aspect: 2, text: "A", caption: "" },
        { id: "b", label: "object", visible: true, lock_aspect: true, cx: 0.7, cy: 0.5, w: 0.2, h: 0.3, orig_aspect: 0.6667, text: "", caption: "B" },
      ],
    };
    S.sel = "a";
    n._vmmoss.commit(); n._vmmoss.rebuildRows(); n._vmmoss.draw();
    const buttons = [...document.querySelectorAll(".vmmoss-btn")];
    buttons.find((b) => b.textContent === "等高").click();
    await new Promise((r) => setTimeout(r, 200));
    const after = JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).boxes;
    return { a: after[0], b: after[1] };
  });
  check("等高：两框高度一致", Math.abs(aligned.a.h - aligned.b.h) < 1e-9,
    `${aligned.a.h} vs ${aligned.b.h}`);
  check("等高：锁定框按比例同步宽度",
    Math.abs((aligned.a.w * 1024) / (aligned.a.h * 1024) - 2) < 0.01,
    ((aligned.a.w * 1024) / (aligned.a.h * 1024)).toFixed(3));

  console.log("\n[U8] F04/onExecuted：真实尺寸回填");
  const syncResult = await page.evaluate(async () => {
    const n = window.__n;
    n.onExecuted({ resolved_size: [[1008, 784]], language: ["en"] });
    await new Promise((r) => setTimeout(r, 400));
    const get = (name) => n.widgets.find((w) => w.name === name).value;
    const canvas = document.querySelector(".vmmoss canvas");
    return {
      width: get("width"), height: get("height"), preset: get("canvas_preset"),
      base: [n._vmmoss.S.state.base_width, n._vmmoss.S.state.base_height],
      view: [canvas.clientWidth, canvas.clientHeight],
    };
  });
  check("onExecuted 回填 1008×784 与 Custom",
    syncResult.width === 1008 && syncResult.height === 784 && syncResult.preset.startsWith("Custom"),
    `${syncResult.width}×${syncResult.height} / ${syncResult.preset}`);
  check("画布基准与视口同步",
    syncResult.base[0] === 1008 && Math.abs(syncResult.view[0] / syncResult.view[1] - 1008 / 784) < 0.02,
    `${syncResult.base.join("×")} / ${syncResult.view.join("×")}`);

  console.log("\n[U9] F01/onExecuted：外部布局回填");
  const backfill = await page.evaluate(async () => {
    const n = window.__n;
    const synced = {
      version: 2, base_width: 1536, base_height: 1024,
      caption: "A warm studio campaign for a handmade ceramic cup.",
      meta: ["product campaign", "studio photography"], canvas: "single",
      boxes: [
        { id: "imp_1", label: "object", visible: true, lock_aspect: false, cx: 0.3, cy: 0.53, w: 0.4, h: 0.63, orig_aspect: 0.95, text: "", caption: "cup" },
        { id: "imp_2", label: "text", visible: true, lock_aspect: true, cx: 0.76, cy: 0.35, w: 0.31, h: 0.17, orig_aspect: 2.7, text: "把日常，过成诗。", caption: "title" },
      ],
    };
    n.onExecuted({ synced_layout_data: [JSON.stringify(synced)], resolved_size: [[1536, 1024]] });
    await new Promise((r) => setTimeout(r, 500));
    const state = JSON.parse(n.widgets.find((w) => w.name === "layout_data").value);
    return {
      boxes: state.boxes.length,
      base: [state.base_width, state.base_height],
      width: n.widgets.find((w) => w.name === "width").value,
      caption: n.widgets.find((w) => w.name === "global_prompt").value,
      meta: n.widgets.find((w) => w.name === "scene_meta").value,
      rows: document.querySelectorAll(".vmmoss-row").length,
    };
  });
  check("外部布局回填 2 个框到画布与列表",
    backfill.boxes === 2 && backfill.rows === 2, `${backfill.boxes}/${backfill.rows}`);
  check("回填同时更新尺寸与全局描述",
    backfill.base[0] === 1536 && backfill.width === 1536 && backfill.caption.startsWith("A warm") &&
    backfill.meta === "product campaign", `${backfill.base.join("×")} / ${backfill.meta}`);

  console.log("\n[U10] G01 参考图状态栏与一键匹配");
  const refBar = await page.evaluate(async () => {
    const n = window.__n;
    // The backdrop only shows while ref_image is wired up (stale payloads are
    // ignored), and input.link is read-only in this frontend — so wire it for real.
    const src = window.LiteGraph.createNode("EmptyImage");
    src.pos = [520, 40];
    window.comfyAPI.app.app.graph.add(src);
    src.connect(0, n, n.inputs.findIndex((input) => input.name === "ref_image"));
    await new Promise((r) => setTimeout(r, 250));
    n.onExecuted({ ref_info: [{
      size: [1080, 1440], aligned: [1088, 1440], canvas: [1536, 1024],
      thumbnail: "data:image/jpeg;base64," + "A".repeat(32),
    }] });
    await new Promise((r) => setTimeout(r, 300));
    const bar = document.querySelector(".vmmoss-ref");
    const match = bar.querySelector(".vmmoss-btn");
    const label = bar.querySelector("span").textContent;
    match.click();
    await new Promise((r) => setTimeout(r, 400));
    const out = {
      visible: bar.classList.contains("show"),
      label,
      matchText: match.textContent,
      width: n.widgets.find((w) => w.name === "width").value,
      height: n.widgets.find((w) => w.name === "height").value,
    };
    n.disconnectInput(n.inputs.findIndex((input) => input.name === "ref_image"));
    window.comfyAPI.app.app.graph.remove(src);
    return out;
  });
  check("参考图栏显示原始尺寸", refBar.visible && /1080×1440/.test(refBar.label), refBar.label);
  check("一键匹配按钮文案为对齐尺寸", /1088×1440/.test(refBar.matchText), refBar.matchText);
  check("一键匹配应用 1088×1440",
    refBar.width === 1088 && refBar.height === 1440, `${refBar.width}×${refBar.height}`);

  console.log("\n[U12] V2.1 画布滚轮缩放 / 中键平移 / 徽章复位");
  const viewBase = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    n.onExecuted({ ref_info: [null] });            // drop the fake backdrop from U10
    S.state = {
      version: 2, base_width: 896, base_height: 1152, palette: [],
      boxes: [
        { id: "z1", label: "object", visible: true, lock_aspect: false, cx: 0.5, cy: 0.5, w: 0.98, h: 0.98, orig_aspect: 0.76, text: "", caption: "bg" },
        { id: "z2", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.2, w: 0.6, h: 0.09, orig_aspect: 5.2, text: "ZOOM", caption: "title" },
      ],
    };
    S.sel = null;
    S.snap = true;
    S.view = { zoom: 1, panX: 0, panY: 0 };
    const preset = n.widgets.find((w) => w.name === "canvas_preset");
    preset.value = "Poster 3:4 Standard (896x1152)";
    preset.callback(preset.value);
    n._vmmoss.commit(); n._vmmoss.rebuildRows(); n._vmmoss.draw(); n._vmmoss.updateFoot();
    await new Promise((r) => setTimeout(r, 500));
    const c = document.querySelector(".vmmoss canvas");
    const r = c.getBoundingClientRect();
    const graph = window.comfyAPI.app.app.canvas;
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      cw: S.canvasW, ch: S.canvasH,
      graphScale: graph.ds.scale, graphOffset: [...graph.ds.offset],
      badgeShown: document.querySelector(".vmmoss-zoom").classList.contains("show"),
    };
  });
  const wheelX = viewBase.rect.x + viewBase.rect.w * 0.5;
  const wheelY = viewBase.rect.y + viewBase.rect.h * 0.5;
  await page.mouse.move(wheelX, wheelY);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);
  const zoomed = await page.evaluate(() => {
    const S = window.__n._vmmoss.S;
    const badge = document.querySelector(".vmmoss-zoom");
    const graph = window.comfyAPI.app.app.canvas;
    return {
      view: { ...S.view }, badgeText: badge.textContent,
      badgeShown: badge.classList.contains("show"),
      graphScale: graph.ds.scale, graphOffset: [...graph.ds.offset],
    };
  });
  check("滚轮放大到 1.2x~6x", zoomed.view.zoom > 1.2 && zoomed.view.zoom <= 6,
    zoomed.view.zoom.toFixed(3));
  check("缩放未触发外层 ComfyUI 画布缩放/平移",
    zoomed.graphScale === viewBase.graphScale &&
    zoomed.graphOffset[0] === viewBase.graphOffset[0] &&
    zoomed.graphOffset[1] === viewBase.graphOffset[1],
    `${zoomed.graphScale} / ${zoomed.graphOffset.join(",")}`);
  check("右上角徽章显示倍率", zoomed.badgeShown && /🔍 \d+% ↺/.test(zoomed.badgeText), zoomed.badgeText);
  const localX = ((wheelX - viewBase.rect.x) / viewBase.rect.w) * viewBase.cw;
  const localY = ((wheelY - viewBase.rect.y) / viewBase.rect.h) * viewBase.ch;
  const anchorAfterX = (localX - zoomed.view.panX) / zoomed.view.zoom;
  const anchorAfterY = (localY - zoomed.view.panY) / zoomed.view.zoom;
  check("缩放锚点为鼠标光标位置",
    Math.abs(anchorAfterX - localX) < 0.8 && Math.abs(anchorAfterY - localY) < 0.8,
    `${localX.toFixed(2)}→${anchorAfterX.toFixed(2)} / ${localY.toFixed(2)}→${anchorAfterY.toFixed(2)}`);

  await page.mouse.move(wheelX, wheelY);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(wheelX - 70, wheelY - 45, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(300);
  const panned = await page.evaluate(() => {
    const S = window.__n._vmmoss.S;
    const graph = window.comfyAPI.app.app.canvas;
    return { view: { ...S.view }, pan: S.pan, scale: graph.ds.scale, offset: [...graph.ds.offset] };
  });
  check("中键拖动平移视口",
    panned.view.panX < zoomed.view.panX - 1 || panned.view.panY < zoomed.view.panY - 1,
    `pan ${zoomed.view.panX.toFixed(1)},${zoomed.view.panY.toFixed(1)} → ${panned.view.panX.toFixed(1)},${panned.view.panY.toFixed(1)}`);
  check("平移未带动外层 ComfyUI 画布",
    panned.scale === viewBase.graphScale && panned.offset[0] === viewBase.graphOffset[0] &&
    panned.offset[1] === viewBase.graphOffset[1], panned.offset.join(","));
  check("中键释放后平移状态清空", panned.pan === null);

  const geo = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.snap = false;
    S.view = { zoom: 2, panX: -S.canvasW * 0.5, panY: 0 };
    S.sel = null;
    n._vmmoss.draw();
    const c = document.querySelector(".vmmoss canvas");
    const r = c.getBoundingClientRect();
    const box = S.state.boxes[1];
    const lx = (box.cx * S.canvasW * 2 - S.canvasW * 0.5) / S.canvasW * r.width;
    const ly = (box.cy * S.canvasH * 2) / S.canvasH * r.height;
    return { x: r.x + lx, y: r.y + ly, rectW: r.width, before: { cx: box.cx, cy: box.cy } };
  });
  await page.waitForTimeout(200);
  await page.mouse.click(geo.x, geo.y);
  await page.waitForTimeout(250);
  const selAt200 = await page.evaluate(() => window.__n._vmmoss.S.sel);
  check("200% + 平移后点击命中正确框", selAt200 === "z2", String(selAt200));

  await page.mouse.move(geo.x, geo.y);
  await page.mouse.down();
  await page.mouse.move(geo.x + 30, geo.y + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const dragged = await page.evaluate(() => {
    const b = window.__n._vmmoss.S.state.boxes[1];
    return { cx: b.cx, cy: b.cy };
  });
  const expectCx = geo.before.cx + 30 / (2 * geo.rectW);
  check("200% 拖动位移按 1/zoom 折算",
    Math.abs(dragged.cx - expectCx) < 1e-3,
    `${dragged.cx.toFixed(4)} vs ${expectCx.toFixed(4)}`);

  await page.click(".vmmoss-zoom");
  await page.waitForTimeout(250);
  const resetView = await page.evaluate(() => ({
    view: { ...window.__n._vmmoss.S.view },
    shown: document.querySelector(".vmmoss-zoom").classList.contains("show"),
  }));
  check("徽章一键复位 100% 居中",
    resetView.view.zoom === 1 && resetView.view.panX === 0 && resetView.view.panY === 0 && !resetView.shown,
    JSON.stringify(resetView.view));

  await page.evaluate(() => {
    const S = window.__n._vmmoss.S;
    S.view = { zoom: 2.5, panX: -60, panY: -40 };
    window.__n._vmmoss.renderZoomBadge();
    window.__n._vmmoss.draw();
    document.querySelector(".vmmoss canvas").focus();
  });
  await page.waitForTimeout(150);
  await page.keyboard.press("0");
  await page.waitForTimeout(220);
  const keyReset = await page.evaluate(() => ({ ...window.__n._vmmoss.S.view }));
  check("快捷键 0 复位 100% 居中", keyReset.zoom === 1 && keyReset.panX === 0 && keyReset.panY === 0,
    JSON.stringify(keyReset));

  console.log("\n[U13] V2.1 一键隐藏 / 显示全部框");
  const toggleAll = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.state.boxes = [
      { id: "h1", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.15, w: 0.7, h: 0.09, orig_aspect: 6, text: "T", caption: "t" },
      { id: "h2", label: "character", visible: true, lock_aspect: true, cx: 0.5, cy: 0.55, w: 0.5, h: 0.4, orig_aspect: 0.87, text: "", caption: "c" },
      { id: "h3", label: "object", visible: true, lock_aspect: false, cx: 0.5, cy: 0.5, w: 0.98, h: 0.98, orig_aspect: 0.76, text: "", caption: "b" },
    ];
    S.sel = null;
    n._vmmoss.commit(); n._vmmoss.rebuildRows(); n._vmmoss.draw(); n._vmmoss.updateFoot();
    await new Promise((r) => setTimeout(r, 250));
    const find = () => [...document.querySelectorAll(".vmmoss-btn")].find((b) => /Hide All|Show All|全部隐藏|全部显示/.test(b.textContent));
    const before = { label: find().textContent, visible: S.state.boxes.filter((b) => b.visible).length };
    find().click();
    await new Promise((r) => setTimeout(r, 300));
    const hidden = {
      label: find().textContent,
      visible: S.state.boxes.filter((b) => b.visible).length,
      foot: document.querySelector(".vmmoss-foot").textContent,
      on: find().classList.contains("on"),
    };
    find().click();
    await new Promise((r) => setTimeout(r, 300));
    const shown = { label: find().textContent, visible: S.state.boxes.filter((b) => b.visible).length };
    return { before, hidden, shown };
  });
  check("默认按钮为「👁 全部隐藏」", /全部隐藏/.test(toggleAll.before.label) && toggleAll.before.visible === 3,
    toggleAll.before.label);
  check("一键隐藏 3 个框", toggleAll.hidden.visible === 0 && /0 可见/.test(toggleAll.hidden.foot),
    `${toggleAll.hidden.visible} / ${toggleAll.hidden.foot}`);
  check("隐藏后按钮切为「🚫 全部显示」并高亮",
    /全部显示/.test(toggleAll.hidden.label) && toggleAll.hidden.on, toggleAll.hidden.label);
  check("再次点击恢复 3 个框", toggleAll.shown.visible === 3 && /全部隐藏/.test(toggleAll.shown.label),
    toggleAll.shown.label);

  console.log("\n[U14] V2.1 全局色板 + 单框调色盘");
  const globalPal = await page.evaluate(async () => {
    const n = window.__n;
    const read = () => JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).palette || [];
    const theme = document.querySelector(".vmmoss-theme");
    theme.value = "tech_neon";
    theme.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const themed = { palette: read(), swatches: document.querySelectorAll(".vmmoss-swatch").length };
    document.querySelector(".vmmoss-swatch button").click();
    await new Promise((r) => setTimeout(r, 200));
    const removed = read();
    const picker = document.querySelector(".vmmoss-pal-input");
    picker.value = "#8b5cf6";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const added = read();
    picker.value = "#8b5cf6";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    return { themed, removed, added, deduped: read() };
  });
  check("预设主题写入 4 个颜色 + 4 个色块",
    JSON.stringify(globalPal.themed.palette) === JSON.stringify(["#0F172A", "#1E40AF", "#38BDF8", "#F8FAFC"]) &&
    globalPal.themed.swatches === 4, JSON.stringify(globalPal.themed.palette));
  check("色块 × 可移除", globalPal.removed.length === 3 && !globalPal.removed.includes("#0F172A"),
    globalPal.removed.join(","));
  check("取色器新增 #8B5CF6", globalPal.added[globalPal.added.length - 1] === "#8B5CF6",
    globalPal.added.join(","));
  check("同一颜色不重复写入", globalPal.deduped.length === globalPal.added.length,
    globalPal.deduped.join(","));

  const boxPal = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    const read = () => JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).boxes;
    document.querySelector('.vmmoss-row[data-id="h1"] .vmmoss-pal-btn').click();
    await new Promise((r) => setTimeout(r, 250));
    const pop = document.querySelector(".vmmoss-pop");
    const opened = !!pop;
    pop.querySelector('[data-color="#9333EA"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const one = read()[0].palette.slice();
    pop.querySelector('[data-color="#9333EA"]').click();
    await new Promise((r) => setTimeout(r, 200));
    const dupe = read()[0].palette.slice();
    const dupeHint = pop.querySelector(".hint").textContent;
    pop.querySelector('[data-color="#06B6D4"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const two = read()[0].palette.slice();
    const dots = document.querySelectorAll('.vmmoss-row[data-id="h1"] .vmmoss-dot').length;
    const c = document.querySelector(".vmmoss canvas");
    // Chrome may colour-manage the backing store, so match "purple-ish" pixels
    // (the nearest other canvas colours are >70 away on some channel).
    const scan = () => {
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - 147) <= 30 && Math.abs(data[i + 1] - 51) <= 30 &&
            Math.abs(data[i + 2] - 234) <= 22) n += 1;
      }
      return n;
    };
    const purple = scan();
    pop.querySelector(".vmmoss-pop-add").parentElement.querySelector(".vmmoss-pop-text").value = "ivory";
    pop.querySelector(".vmmoss-pop-add").click();
    await new Promise((r) => setTimeout(r, 250));
    const typed = read()[0].palette.slice();
    pop.querySelector(".vmmoss-pop-clear").click();
    await new Promise((r) => setTimeout(r, 250));
    const cleared = read()[0].palette.slice();
    const title = pop.querySelector("h4 span").textContent;
    return {
      opened, one, dupe, dupeHint, two, dots, purple, typed, cleared, title,
      canvasSize: [c.width, c.height], view: { ...S.view },
      visible: read().filter((b) => b.visible).length,
      popClosed: !document.querySelector(".vmmoss-pop"),
    };
  });
  check("点击行内 🎨 打开图层色板弹窗", boxPal.opened && boxPal.title === "图层色板", boxPal.title);
  check("快捷色盘写入 item.palette", JSON.stringify(boxPal.one) === JSON.stringify(["#9333EA"]),
    boxPal.one.join(","));
  check("重复颜色不重复添加并提示", boxPal.dupe.length === 1 && /已在色板中/.test(boxPal.dupeHint), boxPal.dupeHint);
  check("第二次选色追加为两色", JSON.stringify(boxPal.two) === JSON.stringify(["#9333EA", "#06B6D4"]),
    boxPal.two.join(","));
  check("图层行渲染两个色点", boxPal.dots === 2, String(boxPal.dots));
  check("画布框角标旁绘制色点", boxPal.purple > 5,
    `${boxPal.purple} px / canvas ${boxPal.canvasSize.join("×")} / visible ${boxPal.visible}`);
  check("手输色值（ivory）归一为 Hex", boxPal.typed.includes("#FFFFF0"), boxPal.typed.join(","));
  check("清空色板", boxPal.cleared.length === 0, boxPal.cleared.join(","));

  await page.getByRole("button", { name: "📤 导出 Draft" }).click();
  await page.waitForSelector(".vmmoss-modal textarea", { timeout: 5000 });
  const palDraft = await page.evaluate(() => JSON.parse(document.querySelector(".vmmoss-modal textarea").value));
  await page.locator('.vmmoss-modal').getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForTimeout(200);
  check("导出 draft 的 summary.palette 与全局色板一致",
    JSON.stringify(palDraft.summary.palette) === JSON.stringify(globalPal.deduped),
    JSON.stringify(palDraft.summary.palette));

  console.log("\n[U15] V2.1 新增文案的中英切换");
  await page.evaluate(() => {
    [...document.querySelectorAll(".vmmoss-btn")]
      .find((b) => b.textContent.replace(/\s/g, "") === "中文|EN").click();
  });
  await page.waitForTimeout(400);
  const enV21 = await page.evaluate(async () => {
    const root = document.querySelector(".vmmoss");
    document.querySelector('.vmmoss-row[data-id="h1"] .vmmoss-pal-btn').click();
    await new Promise((r) => setTimeout(r, 220));
    const pop = document.querySelector(".vmmoss-pop");
    const out = {
      buttons: [...root.querySelectorAll(".vmmoss-btn")].map((b) => b.textContent),
      palLabel: root.querySelector(".vmmoss-pal-label").textContent,
      themeOptions: [...root.querySelectorAll(".vmmoss-theme option")].map((o) => o.textContent),
      popTitle: pop?.querySelector("h4 span")?.textContent || "",
      popHint: pop?.querySelector(".sub")?.textContent || "",
      zoomTip: root.querySelector(".vmmoss-zoom").title,
    };
    pop?.querySelector(".vmmoss-pop-clear")?.click();
    return out;
  });
  check("EN：工具栏显示 Hide All", enV21.buttons.includes("👁 Hide All"), enV21.buttons.join(" / ").slice(0, 120));
  check("EN：全局色板标签与主题本地化",
    /Global palette/.test(enV21.palLabel) && enV21.themeOptions.includes("Tech Neon") &&
    enV21.themeOptions.includes("Black & Gold"), `${enV21.palLabel} | ${enV21.themeOptions.join(",")}`);
  check("EN：图层色板弹窗标题与分组本地化",
    enV21.popTitle === "Layer palette" && enV21.popHint === "Poster colours",
    `${enV21.popTitle} / ${enV21.popHint}`);
  check("EN：缩放徽章提示本地化", /Reset to 100%/.test(enV21.zoomTip), enV21.zoomTip);
  await page.evaluate(() => {
    [...document.querySelectorAll(".vmmoss-btn")]
      .find((b) => b.textContent.replace(/\s/g, "") === "中文|EN").click();
  });
  await page.waitForTimeout(300);
  const backZhV21 = await page.evaluate(() => window.__n.widgets.find((w) => w.name === "ui_language").value);
  check("切回中文", backZhV21 === "中文 (ZH)", backZhV21);

  console.log('\n[U16] V2.1 missing real-input regressions');
  await page.evaluate(() => {
    const n = window.__n, S = n._vmmoss.S;
    S.snap = false; S.sel = null; S.state.palette = [];
    S.state.boxes = [{id:'v21_geometry',label:'object',visible:true,lock_aspect:false,
      cx:0.5,cy:0.5,w:0.25,h:0.25,orig_aspect:1,text:'',caption:'Geometry',palette:[]}];
    n._vmmoss.resetView(); n._vmmoss.commit(); n._vmmoss.rebuildRows();
    n._vmmoss.renderPaletteBar(); n._vmmoss.draw(); n._vmmoss.updateFoot();
  });
  const readV21 = () => page.evaluate(() => {
    const n=window.__n,S=n._vmmoss.S,r=document.querySelector('.vmmoss-canvas').getBoundingClientRect();
    return {view:{...S.view},box:{...S.state.boxes[0]},count:S.state.boxes.length,space:S.space,pan:S.pan,
      cw:S.canvasW,ch:S.canvasH,rect:{x:r.x,y:r.y,w:r.width,h:r.height},
      graph:{scale:window.comfyAPI.app.app.canvas.ds.scale,offset:[...window.comfyAPI.app.app.canvas.ds.offset]}};
  });
  const pointV21=(s,nx,ny)=>({x:s.rect.x+(nx*s.cw*s.view.zoom+s.view.panX)*s.rect.w/s.cw,
    y:s.rect.y+(ny*s.ch*s.view.zoom+s.view.panY)*s.rect.h/s.ch});
  let vs=await readV21();
  const anchorV21={x:vs.rect.x+vs.rect.w*0.43,y:vs.rect.y+vs.rect.h*0.46};
  await page.mouse.move(anchorV21.x,anchorV21.y);
  await page.mouse.wheel(0,-Math.log(2)/0.0018); await page.waitForTimeout(250);
  let vz=await readV21();
  check('V21 real wheel reaches approximately 200%',Math.abs(vz.view.zoom-2)<0.02,JSON.stringify(vz.view));
  check('V21 cursor anchor survives wheel zoom',
    Math.abs((0.43*vz.cw-vz.view.panX)/vz.view.zoom-0.43*vs.cw)<1 &&
    Math.abs((0.46*vz.ch-vz.view.panY)/vz.view.zoom-0.46*vs.ch)<1);
  check('V21 wheel leaves host scale and offset unchanged',JSON.stringify(vs.graph)===JSON.stringify(vz.graph));
  await page.mouse.move(anchorV21.x,anchorV21.y); await page.mouse.down({button:'middle'});
  await page.mouse.move(anchorV21.x-25,anchorV21.y-18,{steps:10}); await page.mouse.up({button:'middle'});
  await page.waitForTimeout(150); let vp=await readV21();
  check('V21 real middle drag changes view by the CSS-correct distance',
    Math.abs(vp.view.panX-vz.view.panX+25*vp.cw/vp.rect.w)<1 &&
    Math.abs(vp.view.panY-vz.view.panY+18*vp.ch/vp.rect.h)<1,JSON.stringify(vp.view));
  check('V21 middle drag leaves host and box geometry unchanged',
    JSON.stringify(vp.graph)===JSON.stringify(vz.graph)&&JSON.stringify(vp.box)===JSON.stringify(vz.box)&&vp.pan===null);
  let center=pointV21(vp,vp.box.cx,vp.box.cy);
  await page.mouse.click(center.x,center.y);
  check('V21 panned 200% canvas selects correct box',await page.evaluate(()=>window.__n._vmmoss.S.sel==='v21_geometry'));
  await page.mouse.move(center.x,center.y);await page.mouse.down();
  await page.mouse.move(center.x+12,center.y+9,{steps:8});await page.mouse.up();
  let moved=await readV21();
  check('V21 panned 200% move has correct X and Y inverse mapping',
    Math.abs(moved.box.cx-vp.box.cx-12/(vp.rect.w*vp.view.zoom))<0.002&&
    Math.abs(moved.box.cy-vp.box.cy-9/(vp.rect.h*vp.view.zoom))<0.002);
  for(const corner of ['nw','ne','sw','se']) {
    const before=await readV21(), b=before.box;
    const west=corner.includes('w'),north=corner.includes('n');
    const p=pointV21(before,b.cx+(west?-b.w/2:b.w/2),b.cy+(north?-b.h/2:b.h/2));
    const dx=west?-7:7,dy=north?-6:6;
    await page.mouse.move(p.x,p.y);await page.mouse.down();
    await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();
    const after=await readV21(), a=after.box;
    const fixedX=b.cx+(west?b.w/2:-b.w/2),fixedY=b.cy+(north?b.h/2:-b.h/2);
    check(`V21 panned 200% ${corner} resize preserves opposite corner and maps distance`,
      Math.abs(a.cx+(west?a.w/2:-a.w/2)-fixedX)<0.002&&
      Math.abs(a.cy+(north?a.h/2:-a.h/2)-fixedY)<0.002&&
      Math.abs(a.w-b.w-Math.abs(dx)/(before.rect.w*before.view.zoom))<0.002&&
      Math.abs(a.h-b.h-Math.abs(dy)/(before.rect.h*before.view.zoom))<0.002,
      JSON.stringify({before:b,after:a}));
  }
  let beforeDouble=await readV21();
  await page.mouse.dblclick(beforeDouble.rect.x+12,beforeDouble.rect.y+12);
  let afterDouble=await readV21();
  check('V21 panned 200% empty double click adds exactly one text box',
    afterDouble.count===beforeDouble.count+1&&await page.evaluate(()=>window.__n._vmmoss.S.state.boxes.at(-1).label==='text'));
  await page.locator('.vmmoss-zoom').click();let reset=await readV21();
  check('V21 reset after pan and geometry edits restores centred 100%',reset.view.zoom===1&&reset.view.panX===0&&reset.view.panY===0);
  await page.mouse.move(reset.rect.x+reset.rect.w/2,reset.rect.y+reset.rect.h/2);
  // Each wheel event is intentionally capped at 400px by the editor.
  for(let i=0;i<4;i++){await page.mouse.wheel(0,-400);await page.waitForTimeout(70);}
  check('V21 wheel upper bound is 600%',(await readV21()).view.zoom===6,JSON.stringify((await readV21()).view));
  for(let i=0;i<4;i++){await page.mouse.wheel(0,400);await page.waitForTimeout(70);}
  const lower=await readV21();check('V21 wheel lower bound is centred 100%',lower.view.zoom===1&&lower.view.panX===0&&lower.view.panY===0);
  await page.mouse.wheel(0,-Math.log(2)/0.0018);await page.waitForTimeout(100);
  let spaceBefore=await readV21();
  // Double-click-to-add focuses its textarea; leave text editing before a canvas shortcut.
  await page.mouse.click(spaceBefore.rect.x+spaceBefore.rect.w/2,spaceBefore.rect.y+spaceBefore.rect.h/2);
  await page.keyboard.down('Space');await page.mouse.down();
  await page.mouse.move(spaceBefore.rect.x+spaceBefore.rect.w/2-20,spaceBefore.rect.y+spaceBefore.rect.h/2-12,{steps:8});
  await page.mouse.up();await page.keyboard.up('Space');
  let spaceAfter=await readV21();
  check('V21 Space plus left drag pans only the inner viewport',spaceAfter.view.panX<spaceBefore.view.panX-1&&JSON.stringify(spaceBefore.graph)===JSON.stringify(spaceAfter.graph)&&!spaceAfter.space,JSON.stringify({before:spaceBefore.view,after:spaceAfter.view,space:spaceAfter.space,graphBefore:spaceBefore.graph,graphAfter:spaceAfter.graph}));
  await page.mouse.move(spaceAfter.rect.x+20,spaceAfter.rect.y+20);await page.keyboard.down('Space');
  await page.mouse.move(spaceAfter.rect.x-30,spaceAfter.rect.y-30);await page.keyboard.up('Space');
  check('V21 releasing Space outside canvas clears modifier',!(await readV21()).space);
  await page.mouse.move(spaceAfter.rect.x+20,spaceAfter.rect.y+20);await page.keyboard.down('Space');
  // Headless Chromium keeps all pages focused/visible, even after bringToFront.
  // Test listener wiring explicitly; this is a synthetic lifecycle event, not an OS-focus E2E claim.
  const beforeBlur=await readV21();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  check('V21 registered blur listener clears active Space (synthetic lifecycle event)',
    beforeBlur.space&&!(await readV21()).space);
  await page.keyboard.up('Space');
  await page.locator('.vmmoss-zoom').click();
  // Native colour dialog: real key changes must not append until Enter commits.
  await page.getByRole('button', {name:'🎨+',exact:true}).click();
  for(const key of ['ArrowLeft','ArrowLeft','ArrowDown','ArrowRight','ArrowDown'])await page.keyboard.press(key);
  const globalDuring=await page.evaluate(()=>({value:document.querySelector('.vmmoss-pal-input').value,palette:window.__n._vmmoss.S.state.palette.slice()}));
  await page.keyboard.press('Enter');
  const globalAfter=await page.evaluate(()=>window.__n._vmmoss.S.state.palette.slice());
  check('V21 native global picker ignores intermediate colours and commits final once',
    globalDuring.palette.length===0&&globalAfter.length===1&&globalAfter[0]===globalDuring.value.toUpperCase(),JSON.stringify({during:globalDuring,after:globalAfter}));
  await page.locator('.vmmoss-row .vmmoss-pal-btn').first().click();
  await page.locator('.vmmoss-pop-color').click();
  for(const key of ['ArrowLeft','ArrowLeft','ArrowDown','ArrowRight','ArrowDown'])await page.keyboard.press(key);
  const layerDuring=await page.evaluate(()=>({value:document.querySelector('.vmmoss-pop-color').value,palette:window.__n._vmmoss.S.state.boxes[0].palette.slice()}));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const layerAfter=await page.evaluate(()=>window.__n._vmmoss.S.state.boxes[0].palette.slice());
  check('V21 native layer picker ignores intermediate colours and commits final once',
    layerDuring.palette.length===0&&layerAfter.length===1&&layerAfter[0]===layerDuring.value.toUpperCase(),JSON.stringify({during:layerDuring,after:layerAfter}));


  console.log("\n[U17] V2.2 吸管拾色 / 画布放大镜 / 参考图提取配色");
  const v22Base = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.state = {
      version: 2, base_width: 896, base_height: 1152, palette: [],
      boxes: [
        { id: "p1", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.15,
          w: 0.7, h: 0.09, orig_aspect: 6, text: "PICK", caption: "title", palette: [] },
        { id: "p2", label: "object", visible: true, lock_aspect: false, cx: 0.5, cy: 0.62,
          w: 0.6, h: 0.28, orig_aspect: 1.5, text: "", caption: "bg", palette: [] },
      ],
    };
    S.sel = null;
    S.eye = null;
    S.ref = null;
    n._vmmoss.resetView();
    const preset = n.widgets.find((w) => w.name === "canvas_preset");
    preset.value = "Poster 3:4 Standard (896x1152)";
    preset.callback(preset.value);
    n._vmmoss.commit();
    n._vmmoss.rebuildRows();
    n._vmmoss.renderRefBar();
    n._vmmoss.renderPaletteBar();
    n._vmmoss.draw();
    n._vmmoss.updateFoot();
    await new Promise((r) => setTimeout(r, 450));
    const c = document.querySelector(".vmmoss-canvas");
    const r = c.getBoundingClientRect();
    return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, cw: S.canvasW, ch: S.canvasH };
  });

  const v22Buttons = await page.evaluate(async () => {
    const root = document.querySelector(".vmmoss");
    const pick = root.querySelector(".vmmoss-pick");
    const palExtract = root.querySelector(".vmmoss-pal .vmmoss-extract");
    const before = {
      pickText: pick?.textContent || "",
      pickTitle: pick?.title || "",
      palExtractHidden: getComputedStyle(palExtract).display === "none",
      refShown: document.querySelector(".vmmoss-ref").classList.contains("show"),
    };
    document.querySelector('.vmmoss-row[data-id="p1"] .vmmoss-pal-btn').click();
    await new Promise((r) => setTimeout(r, 220));
    const pop = document.querySelector(".vmmoss-pop");
    const out = {
      ...before,
      popPickText: pop?.querySelector(".vmmoss-pop-pick")?.textContent || "",
      popPickTitle: pop?.querySelector(".vmmoss-pop-pick")?.title || "",
    };
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    out.popClosed = !document.querySelector(".vmmoss-pop");
    return out;
  });
  check("全局色板栏有 [💧 吸管] 按钮",
    /💧/.test(v22Buttons.pickText) && /吸管/.test(v22Buttons.pickText), `${v22Buttons.pickText} / ${v22Buttons.pickTitle}`);
  check("单框调色盘有 [💧 吸管取色] 按钮",
    /💧/.test(v22Buttons.popPickText) && v22Buttons.popClosed,
    `${v22Buttons.popPickText} / ${v22Buttons.popPickTitle}`);
  check("无参考图时 🎨 提取配色按钮隐藏", v22Buttons.palExtractHidden && !v22Buttons.refShown);

  const nativePick = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    const read = () => JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).palette || [];
    window.__realEyeDropper = window.EyeDropper;
    let opens = 0;
    window.EyeDropper = class {
      async open() { opens += 1; return { sRGBHex: "#123456" }; }
    };
    document.querySelector(".vmmoss-pick").click();
    await new Promise((r) => setTimeout(r, 300));
    const once = read();
    const eyeAfterFirst = !!S.eye;
    document.querySelector(".vmmoss-pick").click();
    await new Promise((r) => setTimeout(r, 300));
    return { opens, once, twice: read(), eyeAfterFirst };
  });
  check("💧 吸管走原生 EyeDropper 并写入全局色板",
    nativePick.opens === 2 && JSON.stringify(nativePick.once) === JSON.stringify(["#123456"]),
    `${nativePick.opens} 次 / ${JSON.stringify(nativePick.once)}`);
  check("原生吸管模式不进入画布降级，重复色自动去重",
    !nativePick.eyeAfterFirst && nativePick.twice.length === 1, JSON.stringify(nativePick.twice));

  const abortPick = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    const read = () => JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).palette || [];
    const before = read();
    window.EyeDropper = class {
      async open() { const err = new Error("cancel"); err.name = "AbortError"; throw err; }
    };
    document.querySelector(".vmmoss-pick").click();
    await new Promise((r) => setTimeout(r, 350));
    return { before, after: read(), eye: !!S.eye };
  });
  check("Esc 取消（AbortError）静默且不污染色板、不降级",
    JSON.stringify(abortPick.before) === JSON.stringify(abortPick.after) && !abortPick.eye,
    JSON.stringify(abortPick.after));

  const fallback = await page.evaluate(async () => {
    const S = window.__n._vmmoss.S;
    delete window.EyeDropper;
    document.querySelector(".vmmoss-pick").click();
    await new Promise((r) => setTimeout(r, 300));
    return {
      eye: S.eye ? { ...S.eye } : null,
      cursor: document.querySelector(".vmmoss-canvas").style.cursor,
      hint: document.querySelector(".vmmoss-pal-hint")?.textContent || "",
    };
  });
  check("无原生 API 时平滑降级到画布吸管（目标=全局）",
    fallback.eye && fallback.eye.target === "global" && fallback.cursor === "copy",
    `${JSON.stringify(fallback.eye)} / ${fallback.cursor}`);
  check("降级时状态栏说明原因",
    /不支持全屏吸管/.test(fallback.hint), fallback.hint);
  await page.evaluate(() => document.querySelector(".vmmoss-canvas").focus());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const escExit = await page.evaluate(() => ({
    eye: !!window.__n._vmmoss.S.eye,
    cursor: document.querySelector(".vmmoss-canvas").style.cursor,
  }));
  check("Esc 退出画布吸管并恢复光标", !escExit.eye && escExit.cursor === "crosshair", escExit.cursor);

  const rightExit = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.sel = null;
    n._vmmoss.enterEyedropper("global");
    await new Promise((r) => setTimeout(r, 120));
    const entered = !!S.eye;
    const c = document.querySelector(".vmmoss-canvas");
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 1,
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
    }));
    c.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, button: 2,
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
    }));
    await new Promise((r2) => setTimeout(r2, 200));
    const palette = JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).palette || [];
    return { entered, eye: !!S.eye, palette };
  });
  check("右键取消吸管且不写入颜色",
    rightExit.entered && !rightExit.eye, JSON.stringify(rightExit));

  // Attach a 4-quadrant reference image through the real onExecuted path, so the
  // test exercises setRef → offscreen buffer → loupe sampling → extraction.
  const refLoaded = await page.evaluate(async () => {
    const n = window.__n;
    const app = window.comfyAPI.app.app;
    const off = document.createElement("canvas");
    off.width = 64; off.height = 64;
    const g = off.getContext("2d");
    g.fillStyle = "#C81E1E"; g.fillRect(0, 0, 32, 32);
    g.fillStyle = "#1E40AF"; g.fillRect(32, 0, 32, 32);
    g.fillStyle = "#F59E0B"; g.fillRect(0, 32, 32, 32);
    g.fillStyle = "#F8FAFC"; g.fillRect(32, 32, 32, 32);
    const src = window.LiteGraph.createNode("EmptyImage");
    src.pos = [520, 40];
    app.graph.add(src);
    window.__refSrc22 = src;
    src.connect(0, n, n.inputs.findIndex((input) => input.name === "ref_image"));
    await new Promise((r) => setTimeout(r, 200));
    n.onExecuted({
      ref_info: [{
        size: [64, 64], aligned: [64, 64], canvas: [896, 1152],
        thumbnail: off.toDataURL("image/png"),
      }],
    });
    for (let i = 0; i < 40; i += 1) {
      if (n._vmmoss.S.ref?.image?.naturalWidth === 64) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    n._vmmoss.renderPaletteBar();
    await new Promise((r) => setTimeout(r, 200));
    return {
      naturalWidth: n._vmmoss.S.ref?.image?.naturalWidth || 0,
      refBarShown: document.querySelector(".vmmoss-ref").classList.contains("show"),
      refExtract: document.querySelector(".vmmoss-ref .vmmoss-extract")?.textContent || "",
      palExtractVisible: getComputedStyle(document.querySelector(".vmmoss-pal .vmmoss-extract")).display !== "none",
    };
  });
  check("参考图加载后两处 🎨 提取配色按钮出现",
    refLoaded.naturalWidth === 64 && refLoaded.refBarShown && refLoaded.palExtractVisible &&
    /🎨/.test(refLoaded.refExtract), refLoaded.refExtract);

  const eyeEnter = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.sel = "p1";
    n._vmmoss.rebuildRows();
    S.inside = true;
    document.querySelector(".vmmoss-canvas").focus();
    return { sel: S.sel };
  });
  await page.keyboard.press("i");
  await page.waitForTimeout(220);
  const eyeState = await page.evaluate(() => ({
    eye: window.__n._vmmoss.S.eye ? { ...window.__n._vmmoss.S.eye } : null,
  }));
  check("快捷键 I 在选中框时进入画布吸管并指向该框",
    eyeState.eye && eyeState.eye.target === "p1", JSON.stringify(eyeState.eye));

  const hoverX = v22Base.rect.x + v22Base.rect.w * 0.25;
  const hoverY = v22Base.rect.y + v22Base.rect.h * 0.25;
  await page.mouse.move(hoverX, hoverY);
  await page.waitForTimeout(250);
  const loupe = await page.evaluate(({ nx, ny }) => {
    const S = window.__n._vmmoss.S;
    const c = document.querySelector(".vmmoss-canvas");
    const ctx = c.getContext("2d");
    const x = Math.round(nx * S.canvasW);
    const y = Math.round(ny * S.canvasH);
    const at = (dx, dy) => {
      const d = ctx.getImageData(x + dx, y + dy, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    return {
      hex: S.eye?.hex || null,
      moved: !!S.eye?.moved,
      center: at(0, 0),
      fill: at(10, 0),
      ring: at(20, 0),
      margin: at(-40, -40),
    };
  }, { nx: 0.25, ny: 0.25 });
  const brightness = (rgb) => (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  check("鼠标移动实时读取像素并给出 #RRGGBB",
    /^#[0-9A-F]{6}$/.test(loupe.hex || "") && loupe.moved &&
    Math.abs(parseInt(loupe.hex.slice(1, 3), 16) - 0xC8) <= 8 &&
    Math.abs(parseInt(loupe.hex.slice(3, 5), 16) - 0x1E) <= 8 &&
    Math.abs(parseInt(loupe.hex.slice(5, 7), 16) - 0x1E) <= 8, String(loupe.hex));
  // The backdrop is painted at refOpacity, while the loupe fills with the *true*
  // pixel colour, so the ring must read brighter than its surroundings; the
  // centre dot and the white stroke add the two contrast steps below.
  check("放大镜在光标处绘制预览环与色值胶囊",
    brightness(loupe.fill) > brightness(loupe.margin) + 20 &&
    brightness(loupe.center) < brightness(loupe.fill) - 20 &&
    brightness(loupe.ring) > brightness(loupe.fill) + 20,
    `fill ${loupe.fill} / center ${loupe.center} / stroke ${loupe.ring} / backdrop ${loupe.margin}`);

  const shotEye = await page.locator(".vmmoss").boundingBox();
  if (shotEye) {
    await page.screenshot({
      path: path.join(OUT, "ui_eyedropper.png"),
      clip: { x: Math.max(0, shotEye.x - 8), y: Math.max(0, shotEye.y - 4), width: shotEye.width + 16, height: shotEye.height + 8 },
    });
  }

  await page.mouse.click(hoverX, hoverY);
  await page.waitForTimeout(300);
  const picked = await page.evaluate(() => {
    const n = window.__n;
    const S = n._vmmoss.S;
    const boxes = JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).boxes;
    return { palette: boxes[0].palette || [], global: S.state.palette || [], eye: !!S.eye };
  });
  const near = (hex, r, g, b, tol = 10) =>
    Math.abs(parseInt(hex.slice(1, 3), 16) - r) <= tol &&
    Math.abs(parseInt(hex.slice(3, 5), 16) - g) <= tol &&
    Math.abs(parseInt(hex.slice(5, 7), 16) - b) <= tol;
  check("左键点击把像素色写入选中框色板并退出吸管",
    picked.palette.length === 1 && near(picked.palette[0], 0xC8, 0x1E, 0x1E) && !picked.eye,
    JSON.stringify(picked.palette));

  const extracted = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    const before = (S.state.palette || []).slice();
    document.querySelector(".vmmoss-ref .vmmoss-extract").click();
    await new Promise((r) => setTimeout(r, 350));
    const after = JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).palette || [];
    return { before, after, hint: document.querySelector(".vmmoss-pal-hint")?.textContent || "" };
  });
  const anchors = [[0xC8, 0x1E, 0x1E], [0x1E, 0x40, 0xAF], [0xF5, 0x9E, 0x0B], [0xF8, 0xFA, 0xFC]];
  const matched = extracted.after.filter((hex) => anchors.some(([r, g, b]) => near(hex, r, g, b, 14)));
  check("🎨 提取配色从参考图取到 4 个主色",
    extracted.after.length === 4 && new Set(extracted.after).size === 4 && matched.length === 4,
    JSON.stringify(extracted.after));
  check("提取结果写入全局色板 summary.palette",
    JSON.stringify(extracted.before) !== JSON.stringify(extracted.after) && /4/.test(extracted.hint),
    extracted.hint);

  await page.evaluate(() => {
    [...document.querySelectorAll(".vmmoss-btn")]
      .find((b) => b.textContent.replace(/\s/g, "") === "中文|EN").click();
  });
  await page.waitForTimeout(400);
  const enV22 = await page.evaluate(async () => {
    const root = document.querySelector(".vmmoss");
    const pick = root.querySelector(".vmmoss-pick");
    const extract = root.querySelector(".vmmoss-pal .vmmoss-extract");
    document.querySelector('.vmmoss-row[data-id="p1"] .vmmoss-pal-btn').click();
    await new Promise((r) => setTimeout(r, 220));
    const pop = document.querySelector(".vmmoss-pop");
    const out = {
      pickText: pick.textContent,
      pickTitle: pick.title,
      extractText: extract.textContent,
      extractTitle: extract.title,
      popPick: pop?.querySelector(".vmmoss-pop-pick")?.textContent || "",
      popPickTitle: pop?.querySelector(".vmmoss-pop-pick")?.title || "",
    };
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    return out;
  });
  check("EN：吸管与提取配色按钮文案本地化",
    /💧 Pick/.test(enV22.pickText) && /🎨 Extract Palette/.test(enV22.extractText) &&
    /Eyedropper/.test(enV22.popPick) &&
    /anywhere on screen/.test(enV22.pickTitle) && /dominant colours/.test(enV22.extractTitle) &&
    /this box/.test(enV22.popPickTitle),
    `${enV22.pickText} | ${enV22.extractText} | ${enV22.popPick}`);
  await page.evaluate(() => {
    [...document.querySelectorAll(".vmmoss-btn")]
      .find((b) => b.textContent.replace(/\s/g, "") === "中文|EN").click();
    const S = window.__n._vmmoss.S;
    S.eye = null;
    window.EyeDropper = window.__realEyeDropper;
  });
  await page.waitForTimeout(300);
  check("切回中文并还原原生 API",
    await page.evaluate(() => window.__n.widgets.find((w) => w.name === "ui_language").value === "中文 (ZH)" &&
      typeof window.EyeDropper === "function"));

  const refCleared = await page.evaluate(async () => {
    const n = window.__n;
    n.disconnectInput(n.inputs.findIndex((input) => input.name === "ref_image"));
    window.comfyAPI.app.app.graph.remove(window.__refSrc22);
    await new Promise((r) => setTimeout(r, 250));
    return {
      ref: !!n._vmmoss.S.ref,
      refBarShown: document.querySelector(".vmmoss-ref").classList.contains("show"),
      palExtractHidden: getComputedStyle(document.querySelector(".vmmoss-pal .vmmoss-extract")).display === "none",
    };
  });
  check("断开参考图后底图与提取按钮同步隐藏",
    !refCleared.ref && !refCleared.refBarShown && refCleared.palExtractHidden,
    JSON.stringify(refCleared));

  console.log("\n[U18] V2.3 顶层三分线 / 黄金分割线");
  const guideBase = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    n.onExecuted({ ref_info: [null] });
    S.eye = null;
    S.inspector = null;
    S.sel = null;
    S.state = {
      version: 2, base_width: 896, base_height: 1152, palette: [],
      boxes: [{ id: "g1", label: "object", visible: true, lock_aspect: false, cx: 0.5, cy: 0.5,
        w: 1, h: 1, orig_aspect: 896 / 1152, text: "", caption: "全屏不透明框", palette: [] }],
    };
    while (S.guides.thirds || S.guides.golden) {
      n._vmmoss.toggleGuide(S.guides.thirds ? "thirds" : "golden");
    }
    n._vmmoss.closeInspector();
    const preset = n.widgets.find((w) => w.name === "canvas_preset");
    preset.value = "Poster 3:4 Standard (896x1152)";
    preset.callback(preset.value);
    n._vmmoss.resetView();
    n._vmmoss.commit();
    n._vmmoss.rebuildRows();
    n._vmmoss.draw();
    n._vmmoss.updateFoot();
    await new Promise((r) => setTimeout(r, 450));
    const c = document.querySelector(".vmmoss-canvas");
    const r = c.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      cw: S.canvasW, ch: S.canvasH, dpr: S.dpr,
      guides: { ...S.guides },
      nodeH: n.size[1],
      barButtons: [...document.querySelectorAll(".vmmoss-bar .vmmoss-btn")]
        .map((b) => b.textContent).filter((text) => /三分线|黄金线/.test(text)),
    };
  });
  check("工具栏有独立的 [📐 三分线] 与 [🔱 黄金线] 按钮",
    guideBase.barButtons.length === 2 && /三分线/.test(guideBase.barButtons[0]) &&
    /黄金线/.test(guideBase.barButtons[1]), guideBase.barButtons.join(" / "));
  check("两个参考线均可手动关闭", !guideBase.guides.thirds && !guideBase.guides.golden,
    JSON.stringify(guideBase.guides));

  const probeGuides = (ratios, crosses) => page.evaluate(({ ratios, crosses }) => {
    const S = window.__n._vmmoss.S;
    const c = document.querySelector(".vmmoss-canvas");
    const ctx = c.getContext("2d");
    const dpr = S.dpr;
    const lum = (x, y) => {
      const d = ctx.getImageData(Math.max(0, Math.round(x * dpr)), Math.max(0, Math.round(y * dpr)), 1, 1).data;
      return (d[0] * 299 + d[1] * 587 + d[2] * 114) / 1000;
    };
    // A 1.25px dashed line can land on a fractional device row, so probe the
    // brightest pixel within ±2px of the nominal position.
    const vertical = (ratio) => {
      let best = 0;
      const x0 = ratio * S.canvasW;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let y = 6; y <= S.canvasH - 6; y += 2) best = Math.max(best, lum(x0 + dx, y));
      }
      return Math.round(best);
    };
    const horizontal = (ratio) => {
      let best = 0;
      const y0 = ratio * S.canvasH;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let x = 6; x <= S.canvasW - 6; x += 2) best = Math.max(best, lum(x, y0 + dy));
      }
      return Math.round(best);
    };
    const cross = (rx, ry) => {
      let best = 0;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          best = Math.max(best, lum(rx * S.canvasW + dx, ry * S.canvasH + dy));
        }
      }
      return Math.round(best);
    };
    return {
      v: ratios.map(vertical),
      h: ratios.map(horizontal),
      cross: crosses.map(([rx, ry]) => cross(rx, ry)),
      plain: Math.round(lum(0.5 * S.canvasW, 0.5 * S.canvasH)),
    };
  }, { ratios, crosses });

  const thirdsRatios = [1 / 3, 2 / 3];
  const goldenRatios = [0.3819660112501051, 0.6180339887498949];
  const goldenCrosses = [
    [0.3819660112501051, 0.3819660112501051], [0.6180339887498949, 0.3819660112501051],
    [0.3819660112501051, 0.6180339887498949], [0.6180339887498949, 0.6180339887498949],
  ];
  const offProbe = await probeGuides(thirdsRatios, goldenCrosses);
  check("关闭时画布上没有参考线（基准亮度）",
    offProbe.v.every((v) => v < 150) && offProbe.plain < 150,
    `v=${offProbe.v.join(",")} plain=${offProbe.plain}`);

  await page.evaluate(() => {
    const n = window.__n;
    [...document.querySelectorAll(".vmmoss-bar .vmmoss-btn")]
      .find((b) => /三分线/.test(b.textContent)).click();
    n._vmmoss.draw();
  });
  await page.waitForTimeout(250);
  const thirdsProbe = await probeGuides(thirdsRatios, goldenCrosses);
  check("三分线开启后 1/3、2/3 处出现高对比白线（覆盖全屏框之上）",
    thirdsProbe.v.every((v) => v > 170) && thirdsProbe.h.every((v) => v > 170),
    `v=${thirdsProbe.v.join(",")} h=${thirdsProbe.h.join(",")}`);
  check("三分线只在 1/3、2/3，不误画黄金线",
    thirdsProbe.cross.every((v) => v < 170), `cross=${thirdsProbe.cross.join(",")}`);
  // A vertical scan always crosses the horizontal guides, so probe the centre point.
  const centreProbe = await probeGuides([], [[0.5, 0.5]]);
  check("画面中心（1/2）没有多余参考线", centreProbe.cross[0] < 120, String(centreProbe.cross[0]));

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".vmmoss-bar .vmmoss-btn")];
    buttons.find((b) => /三分线/.test(b.textContent)).click();
    buttons.find((b) => /黄金线/.test(b.textContent)).click();
    window.__n._vmmoss.draw();
  });
  await page.waitForTimeout(250);
  const goldenProbe = await probeGuides(goldenRatios, goldenCrosses);
  check("黄金线在 0.382 / 0.618 处绘制四条贯穿线",
    goldenProbe.v.every((v) => v > 170) && goldenProbe.h.every((v) => v > 170),
    `v=${goldenProbe.v.join(",")} h=${goldenProbe.h.join(",")}`);
  check("黄金线绘制 4 个焦点十字",
    goldenProbe.cross.every((v) => v > 170), `cross=${goldenProbe.cross.join(",")}`);
  const thirdsOff = await probeGuides(thirdsRatios, []);
  check("仅开黄金线时不再显示三分线", thirdsOff.v.every((v) => v < 170), `v=${thirdsOff.v.join(",")}`);

  const snapSetup = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.state = {
      version: 2, base_width: 896, base_height: 1152, palette: [],
      boxes: [{ id: "s1", label: "object", visible: true, lock_aspect: false, cx: 0.336, cy: 0.5,
        w: 0.2, h: 0.2, orig_aspect: 0.78, text: "", caption: "吸附测试", palette: [] }],
    };
    S.sel = null;
    S.snap = true;
    if (!S.guides.thirds) n._vmmoss.toggleGuide("thirds");
    n._vmmoss.commit();
    n._vmmoss.rebuildRows();
    n._vmmoss.draw();
    await new Promise((r) => setTimeout(r, 300));
    const c = document.querySelector(".vmmoss-canvas");
    const r = c.getBoundingClientRect();
    const box = S.state.boxes[0];
    const toScreen = (nx, ny) => ({
      x: r.x + ((nx * S.canvasW * S.view.zoom + S.view.panX) / S.canvasW) * r.width,
      y: r.y + ((ny * S.canvasH * S.view.zoom + S.view.panY) / S.canvasH) * r.height,
    });
    return {
      start: toScreen(box.cx, box.cy),
      end: toScreen(box.cx + 2 / S.canvasW, box.cy),
      startCx: box.cx,
    };
  });
  await page.mouse.move(snapSetup.start.x, snapSetup.start.y);
  await page.mouse.down();
  await page.mouse.move(snapSetup.end.x, snapSetup.end.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const snappedCx = await page.evaluate(() => window.__n._vmmoss.S.state.boxes[0].cx);
  check("拖动框靠近三分线时自动吸附到 1/3",
    Math.abs(snappedCx - 1 / 3) < 1e-6, `${snapSetup.startCx.toFixed(4)} → ${snappedCx.toFixed(6)}`);

  await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    if (S.guides.thirds) n._vmmoss.toggleGuide("thirds");
    S.state.boxes[0].cx = 0.336;
    S.state.boxes[0].cy = 0.5;
    n._vmmoss.commit();
    n._vmmoss.draw();
    await new Promise((r) => setTimeout(r, 200));
  });
  const noSnapSetup = await page.evaluate(() => {
    const n = window.__n;
    const S = n._vmmoss.S;
    const c = document.querySelector(".vmmoss-canvas");
    const r = c.getBoundingClientRect();
    const box = S.state.boxes[0];
    return {
      start: { x: r.x + box.cx * r.width, y: r.y + box.cy * r.height },
      end: { x: r.x + (box.cx + 2 / S.canvasW) * r.width, y: r.y + box.cy * r.height },
    };
  });
  await page.mouse.move(noSnapSetup.start.x, noSnapSetup.start.y);
  await page.mouse.down();
  await page.mouse.move(noSnapSetup.end.x, noSnapSetup.end.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const plainCx = await page.evaluate(() => window.__n._vmmoss.S.state.boxes[0].cx);
  check("关闭参考线后不再吸附（只按网格）",
    Math.abs(plainCx - 1 / 3) > 1e-6, plainCx.toFixed(6));

  const guideDraft = async () => {
    await page.getByRole("button", { name: "📤 导出 Draft" }).click();
    await page.waitForSelector(".vmmoss-modal textarea", { timeout: 5000 });
    const text = await page.evaluate(() => document.querySelector(".vmmoss-modal textarea").value);
    await page.locator(".vmmoss-modal").getByRole("button", { name: "关闭", exact: true }).click();
    await page.waitForTimeout(150);
    return text;
  };
  const draftWithGuides = await guideDraft();
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".vmmoss-bar .vmmoss-btn")];
    buttons.find((b) => /黄金线/.test(b.textContent)).click();
  });
  await page.waitForTimeout(200);
  const draftWithoutGuides = await guideDraft();
  check("参考线开关不影响 draft_json",
    draftWithGuides === draftWithoutGuides && !/thirds|golden/.test(draftWithGuides),
    `${draftWithGuides.length} vs ${draftWithoutGuides.length} chars`);
  const layoutClean = await page.evaluate(() =>
    !/thirds|golden|guide/i.test(window.__n.widgets.find((w) => w.name === "layout_data").value));
  check("参考线不写入 layout_data", layoutClean);

  const guidePersist = await page.evaluate(async () => {
    const app = window.comfyAPI.app.app;
    const n = window.__n;
    n._vmmoss.toggleGuide("thirds");
    const want = { ...n._vmmoss.S.guides };
    const serialized = app.graph.serialize();
    const saved = (serialized.nodes.find((nd) => nd.type === "VMMOSSLayoutStudio") || {})
      .properties?.vmmoss_guides || null;
    app.graph.clear();
    await new Promise((r) => setTimeout(r, 350));
    app.graph.configure(serialized);
    await new Promise((r) => setTimeout(r, 900));
    const restoredNode = app.graph._nodes.find((nd) => nd.type === "VMMOSSLayoutStudio");
    if (restoredNode) window.__n = restoredNode;
    return { want, saved, got: restoredNode?._vmmoss?.S.guides || null };
  });
  check("参考线状态写入 node.properties",
    JSON.stringify(guidePersist.saved) === JSON.stringify(guidePersist.want),
    JSON.stringify(guidePersist.saved));
  check("保存 / 重载后参考线状态恢复",
    JSON.stringify(guidePersist.got) === JSON.stringify(guidePersist.want),
    JSON.stringify(guidePersist.got));

  console.log("\n[U19] V2.3 展开式大号文字编辑抽屉");
  const inspBase = await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.state = {
      version: 2, base_width: 896, base_height: 1152, palette: [],
      boxes: [
        { id: "k1", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.12,
          w: 0.8, h: 0.08, orig_aspect: 10, text: "原标题", caption: "原样式", palette: [] },
        { id: "k2", label: "character", visible: true, lock_aspect: true, cx: 0.5, cy: 0.55,
          w: 0.5, h: 0.4, orig_aspect: 0.87, text: "", caption: "原角色描述", palette: [] },
      ],
    };
    while (S.guides.thirds || S.guides.golden) n._vmmoss.toggleGuide(S.guides.thirds ? "thirds" : "golden");
    S.sel = null;
    S.inspector = null;
    n._vmmoss.closeInspector();
    n._vmmoss.commit();
    n._vmmoss.rebuildRows();
    n._vmmoss.draw();
    n._vmmoss.updateFoot();
    await new Promise((r) => setTimeout(r, 400));
    return {
      nodeH: n.size[1],
      expandButtons: document.querySelectorAll(".vmmoss-expand").length,
      rows: document.querySelectorAll(".vmmoss-row").length,
      drawerShown: document.querySelector(".vmmoss-inspector").classList.contains("show"),
    };
  });
  check("每行都有 [⤢] 展开按钮", inspBase.expandButtons === 2 && inspBase.rows === 2,
    `${inspBase.expandButtons}/${inspBase.rows}`);
  check("默认不展开抽屉", !inspBase.drawerShown);

  await page.click('.vmmoss-row[data-id="k1"] .vmmoss-expand');
  await page.waitForTimeout(350);
  const inspOpen = await page.evaluate(() => {
    const d = document.querySelector(".vmmoss-inspector");
    const root = document.querySelector(".vmmoss").getBoundingClientRect();
    const box = d.getBoundingClientRect();
    const text = d.querySelector(".vmmoss-insp-text");
    const caption = d.querySelector(".vmmoss-insp-caption");
    return {
      shown: d.classList.contains("show"),
      ratio: box.width / root.width,
      box: d.dataset.box,
      text: text?.value ?? null,
      caption: caption?.value ?? null,
      resize: text ? getComputedStyle(text).resize : null,
      fontSize: text ? parseFloat(getComputedStyle(text).fontSize) : null,
      nodeH: window.__n.size[1],
      selected: window.__n._vmmoss.S.sel,
    };
  });
  check("点击 [⤢] 展开全宽抽屉并选中该框",
    inspOpen.shown && inspOpen.ratio > 0.98 && inspOpen.box === "k1" && inspOpen.selected === "k1",
    `ratio=${inspOpen.ratio.toFixed(3)} box=${inspOpen.box}`);
  check("抽屉里渲染文字与样式两个大号多行输入",
    inspOpen.text === "原标题" && inspOpen.caption === "原样式" &&
    inspOpen.fontSize >= 12 && inspOpen.resize === "vertical",
    `${inspOpen.text} / ${inspOpen.caption} / ${inspOpen.fontSize}px / ${inspOpen.resize}`);
  check("抽屉只增高一个面板的高度",
    inspOpen.nodeH - inspBase.nodeH > 40 && inspOpen.nodeH - inspBase.nodeH < 260,
    `+${inspOpen.nodeH - inspBase.nodeH}px`);

  await page.fill(".vmmoss-insp-text", "第一行标题\n第二行副标题");
  await page.fill(".vmmoss-insp-caption", "白色粗体现代无衬线，两行居中");
  await page.waitForTimeout(300);
  const inspTyped = await page.evaluate(() => {
    const n = window.__n;
    const state = JSON.parse(n.widgets.find((w) => w.name === "layout_data").value);
    const row = [...document.querySelectorAll(".vmmoss-row")].find((r) => r.dataset.id === "k1");
    return {
      text: state.boxes[0].text,
      caption: state.boxes[0].caption,
      rowText: row.querySelector("textarea")?.value ?? null,
      rowCaption: row.querySelector("input")?.value ?? null,
    };
  });
  check("多行文字实时同步到 layout_data 与图层行",
    inspTyped.text === "第一行标题\n第二行副标题" && inspTyped.rowText === inspTyped.text,
    JSON.stringify(inspTyped.text));
  check("样式描述实时同步到图层行",
    inspTyped.caption === "白色粗体现代无衬线，两行居中" && inspTyped.rowCaption === inspTyped.caption,
    inspTyped.rowCaption);

  // Click a non-interactive part of the row (the tag chip) so selection changes.
  await page.click('.vmmoss-row[data-id="k2"] .vmmoss-tag');
  await page.waitForTimeout(400);
  const inspFollow = await page.evaluate(() => {
    const d = document.querySelector(".vmmoss-inspector");
    return {
      box: d.dataset.box,
      hasText: !!d.querySelector(".vmmoss-insp-text"),
      caption: d.querySelector(".vmmoss-insp-caption")?.value ?? null,
      shown: d.classList.contains("show"),
      nodeH: window.__n.size[1],
    };
  });
  check("切换选中框后同一抽屉跟随新框",
    inspFollow.shown && inspFollow.box === "k2" && inspFollow.caption === "原角色描述",
    `${inspFollow.box} / ${inspFollow.caption}`);
  check("角色框只显示描述字段，且抽屉高度不叠加",
    !inspFollow.hasText && inspFollow.nodeH <= inspOpen.nodeH + 40,
    `hasText=${inspFollow.hasText} nodeH=${inspFollow.nodeH}`);

  await page.click(".vmmoss-insp-close");
  await page.waitForTimeout(400);
  const inspClosed = await page.evaluate(() => ({
    shown: document.querySelector(".vmmoss-inspector").classList.contains("show"),
    inspector: window.__n._vmmoss.S.inspector,
    nodeH: window.__n.size[1],
  }));
  check("点「收起」关闭抽屉并还原节点高度",
    !inspClosed.shown && inspClosed.inspector === null && Math.abs(inspClosed.nodeH - inspBase.nodeH) <= 40,
    `nodeH=${inspClosed.nodeH} base=${inspBase.nodeH}`);

  console.log("\n[U20] V2.3 外部文本端口回填（onExecuted）");
  const textBackfill = await page.evaluate(async () => {
    const n = window.__n;
    const payload = {
      version: 2, base_width: 896, base_height: 1152,
      caption: "连线带来的全局描述",
      boxes: [
        { id: "k1", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.12,
          w: 0.8, h: 0.08, orig_aspect: 10, text: "连线标题", caption: "连线样式", palette: [] },
        { id: "k2", label: "character", visible: true, lock_aspect: true, cx: 0.5, cy: 0.55,
          w: 0.5, h: 0.4, orig_aspect: 0.87, text: "", caption: "连线角色描述", palette: [] },
      ],
    };
    n.onExecuted({
      resolved_size: [[896, 1152]],
      synced_caption: ["连线带来的全局描述"],
      synced_layout_data: [JSON.stringify(payload)],
    });
    await new Promise((r) => setTimeout(r, 600));
    const row = [...document.querySelectorAll(".vmmoss-row")].find((r) => r.dataset.id === "k1");
    return {
      caption: n.widgets.find((w) => w.name === "global_prompt").value,
      text: JSON.parse(n.widgets.find((w) => w.name === "layout_data").value).boxes[0].text,
      rowText: row?.querySelector("textarea")?.value ?? null,
      rows: document.querySelectorAll(".vmmoss-row").length,
      width: n.widgets.find((w) => w.name === "width").value,
    };
  });
  check("onExecuted 回填全局描述",
    textBackfill.caption === "连线带来的全局描述", textBackfill.caption);
  check("onExecuted 回填各框文案到画布与图层行",
    textBackfill.text === "连线标题" && textBackfill.rowText === "连线标题" &&
    textBackfill.rows === 2 && textBackfill.width === 896,
    `${textBackfill.text} / ${textBackfill.rows} 行`);

  const footLink = await page.evaluate(async () => {
    const n = window.__n;
    const app = window.comfyAPI.app.app;
    const src = window.LiteGraph.createNode("PrimitiveString");
    src.pos = [520, 40];
    app.graph.add(src);
    window.__linkSrc = src;
    const idx = n.inputs.findIndex((input) => input.name === "box_texts_in");
    if (idx < 0) return { skipped: true };
    src.connect(0, n, idx);
    await new Promise((r) => setTimeout(r, 300));
    return { foot: document.querySelector(".vmmoss-foot").textContent, idx };
  });
  check("连线 box_texts_in 时状态栏提示文案来自连线",
    footLink.skipped ? false : /文案来自连线/.test(footLink.foot), footLink.foot || "no port");
  await page.evaluate(() => {
    const n = window.__n;
    const idx = n.inputs.findIndex((input) => input.name === "box_texts_in");
    if (idx >= 0) n.disconnectInput(idx);
    if (window.__linkSrc) window.comfyAPI.app.app.graph.remove(window.__linkSrc);
  });
  await page.waitForTimeout(200);

  {
  console.log("\n[U21] V2.3 复核修复：全局编辑高度、重载、执行后继续编辑");
  await page.evaluate(async () => {
    const app = window.comfyAPI.app.app;
    app.graph.clear();
    await new Promise(r => setTimeout(r, 300));
    const n = window.LiteGraph.createNode("VMMOSSLayoutStudio");
    n.pos = [40, 40]; app.graph.add(n); window.__n = n;
    app.canvas.ds.scale = 0.78; app.canvas.ds.offset = [416, 110];
    await new Promise(r => setTimeout(r, 700));
    const el = n.widgets.find(w => w.name === "global_prompt").inputEl;
    el.dataset.vmmossAuditCaption = "true";
  });
  const globalBefore = await page.evaluate(() => {
    const n = window.__n, w = n.widgets.find(w => w.name === "global_prompt"), el = w.inputEl;
    return { resize: getComputedStyle(el).resize, height: el.offsetHeight, nodeHeight: n.size[1] };
  });
  check("全局描述默认加高且可纵向拖动", globalBefore.resize === "vertical" && globalBefore.height >= 84,
    JSON.stringify(globalBefore));
  const globalInput = page.locator('[data-vmmoss-audit-caption="true"]');
  await globalInput.fill("全局多行描述\n第二行光影要求");
  check("全局描述多行编辑仍写入原生 STRING 控件",
    await page.evaluate(() => window.__n.widgets.find(w => w.name === "global_prompt").value === "全局多行描述\n第二行光影要求"));
  const resizeRect = await globalInput.boundingBox();
  await page.mouse.move(resizeRect.x + resizeRect.width - 3, resizeRect.y + resizeRect.height - 3);
  await page.mouse.down();
  await page.mouse.move(resizeRect.x + resizeRect.width - 3, resizeRect.y + resizeRect.height + 100, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const globalAfter = await page.evaluate(() => {
    const n = window.__n, el = n.widgets.find(w => w.name === "global_prompt").inputEl;
    const rect = el.getBoundingClientRect(), parentRect = el.parentElement.getBoundingClientRect();
    return { height: el.offsetHeight, nodeHeight: n.size[1], savedHeight: n.properties.vmmoss_caption_height,
      fitsAllocation: rect.bottom <= parentRect.bottom + 1 && rect.top >= parentRect.top - 1,
      noOverlap: el.getBoundingClientRect().bottom <= document.querySelector(".vmmoss").getBoundingClientRect().top };
  });
  check("拖高全局描述后节点同步增高且不覆盖布局画布",
    globalAfter.height > globalBefore.height + 60 && globalAfter.nodeHeight > globalBefore.nodeHeight + 60 && globalAfter.noOverlap,
    JSON.stringify(globalAfter));
  check("拖高全局描述后不越过原生控件分配区域或遮挡下一行", globalAfter.fitsAllocation,
    JSON.stringify(globalAfter));
  const restored = await page.evaluate(async () => {
    const app = window.comfyAPI.app.app, n = window.__n;
    if (n._vmmoss.S.guides.thirds) n._vmmoss.toggleGuide("thirds");
    const saved = app.graph.serialize();
    app.graph.clear(); app.graph.configure(saved);
    window.__n = app.graph.getNodeById(n.id);
    await new Promise(r => setTimeout(r, 600));
    const fresh = window.__n, w = fresh.widgets.find(w => w.name === "global_prompt");
    return { guides: fresh._vmmoss.S.guides, height: w.inputEl.offsetHeight,
      caption: w.value, savedHeight: fresh.properties.vmmoss_caption_height };
  });
  check("用户关闭的参考线保存重载后仍关闭", !restored.guides.thirds && !restored.guides.golden,
    JSON.stringify(restored.guides));
  check("全局描述高度与多行文字随工作流重载恢复",
    Math.abs(restored.height - globalAfter.height) <= 1 && restored.caption === "全局多行描述\n第二行光影要求",
    JSON.stringify(restored));

  await page.evaluate(async () => {
    const n = window.__n, a = n._vmmoss, app = window.comfyAPI.app.app;
    a.S.state = { version: 2, base_width: 896, base_height: 1152, boxes: [
      { id: "v23_text", label: "text", cx: 0.5, cy: 0.2, w: 0.7, h: 0.1,
        visible: true, lock_aspect: false, text: "执行前标题", caption: "执行前样式", palette: [] },
    ] };
    a.commit(); a.rebuildRows(); a.openInspector("v23_text");
    window.__beforeExecutionBox = a.S.state.boxes[0];
    const src = window.LiteGraph.createNode("PrimitiveString"); app.graph.add(src);
    src.widgets.find(w => w.name === "value").value = "真实执行回填全局描述";
    src.connect(0, n, n.inputs.findIndex(i => i.name === "global_prompt_in"));
    await app.queuePrompt(0, 1);
  });
  await page.waitForFunction(() => window.__n.widgets.find(w => w.name === "global_prompt").value === "真实执行回填全局描述",
    null, { timeout: 60000 });
  check("真实连线执行回填后抽屉仍打开且状态对象已更新",
    await page.evaluate(() => document.querySelector(".vmmoss-inspector").classList.contains("show") &&
      window.__n._vmmoss.S.state.boxes[0] !== window.__beforeExecutionBox));
  await page.fill(".vmmoss-insp-text", "执行后手动第一行\n第二行");
  await page.fill(".vmmoss-insp-caption", "执行后手动样式");
  const editedAfterRun = await page.evaluate(() => {
    const n = window.__n, box = JSON.parse(n.widgets.find(w => w.name === "layout_data").value).boxes[0];
    return { text: box.text, caption: box.caption,
      rowText: document.querySelector(".vmmoss-row textarea").value,
      rowCaption: document.querySelector(".vmmoss-row input").value };
  });
  check("真实执行后抽屉改字及样式同步保存并更新列表",
    editedAfterRun.text === "执行后手动第一行\n第二行" && editedAfterRun.caption === "执行后手动样式" &&
    editedAfterRun.rowText === editedAfterRun.text && editedAfterRun.rowCaption === editedAfterRun.caption,
    JSON.stringify(editedAfterRun));
  await page.evaluate(async () => {
    const app = window.comfyAPI.app.app, n = window.__n;
    const show = window.LiteGraph.createNode("ShowText|pysssss"); app.graph.add(show);
    n.connect(0, show, 0);
    window.__compiledAfterEdit = null;
    const original = show.onExecuted;
    show.onExecuted = function(message) { window.__compiledAfterEdit = message.text?.[0]; return original?.apply(this, arguments); };
    await app.queuePrompt(0, 1);
  });
  await page.waitForFunction(() => !!window.__compiledAfterEdit, null, { timeout: 60000 });
  const compiledAfterEdit = await page.evaluate(() => JSON.parse(window.__compiledAfterEdit));
  check("再次真实执行的 layout_prompt 包含回填后的手动编辑",
    compiledAfterEdit.items[0].text === editedAfterRun.text && compiledAfterEdit.items[0].caption === editedAfterRun.caption,
    JSON.stringify(compiledAfterEdit.items[0]));
  fs.writeFileSync(path.join(OUT, "v23_real_edit_output.json"), JSON.stringify(compiledAfterEdit, null, 2), "utf-8");
  }

  console.log("\n[U11] 截图");
  await page.evaluate(async () => {
    const n = window.__n;
    n._vmmoss.closePalettePop();
    const S = n._vmmoss.S;
    S.state = {
      version: 2, base_width: 896, base_height: 1152,
      palette: ["#0F172A", "#1E40AF", "#38BDF8", "#F8FAFC"],
      boxes: [
        { id: "box_1", label: "object", visible: true, lock_aspect: false, cx: 0.5, cy: 0.5, w: 0.98, h: 0.98, orig_aspect: 0.762, text: "", caption: "深蓝渐变背景 + 细网格纹理", palette: ["#0F172A", "#1E40AF"] },
        { id: "box_2", label: "character", visible: true, lock_aspect: true, cx: 0.5, cy: 0.56, w: 0.56, h: 0.5, orig_aspect: 0.87, text: "", caption: "赛博朋克风格女性机器人半身像，霓虹轮廓光", palette: ["#38BDF8"] },
        { id: "box_3", label: "text", visible: true, lock_aspect: true, cx: 0.5, cy: 0.13, w: 0.82, h: 0.11, orig_aspect: 5.8, text: "AI 开发者大会 2026", caption: "Large bold white sans-serif title", palette: ["#F8FAFC", "#38BDF8"] },
        { id: "box_4", label: "text", visible: true, lock_aspect: true, cx: 0.24, cy: 0.87, w: 0.32, h: 0.07, orig_aspect: 3.56, text: "10月25日", caption: "浅青色小字", palette: ["#38BDF8"] },
        { id: "box_5", label: "text", visible: true, lock_aspect: true, cx: 0.72, cy: 0.87, w: 0.34, h: 0.07, orig_aspect: 3.78, text: "上海·徐汇", caption: "浅青色小字", palette: ["#38BDF8"] },
      ],
    };
    S.sel = null;
    const preset = n.widgets.find((w) => w.name === "canvas_preset");
    preset.value = "Poster 3:4 Standard (896x1152)";
    preset.callback(preset.value);
    S.view = { zoom: 1, panX: 0, panY: 0 };
    // V2.3: show the thirds guides and the expanded inspector in the artefact.
    if (!S.guides.thirds) n._vmmoss.toggleGuide("thirds");
    n._vmmoss.commit();
    n._vmmoss.renderPaletteBar();
    n._vmmoss.openInspector("box_3");
    n._vmmoss.draw(); n._vmmoss.updateFoot(); n._vmmoss.renderZoomBadge();
    await new Promise((r) => setTimeout(r, 700));
  });
  await page.waitForTimeout(400);
  const box = await page.locator(".vmmoss").boundingBox();
  if (box) {
    await page.screenshot({
      path: path.join(OUT, "ui_node.png"),
      clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 4), width: box.width + 16, height: box.height + 8 },
    });
  }
  await page.screenshot({ path: path.join(OUT, "ui_full.png") });

  // Second shot: 200% zoom with the badge, to document the V2.1 view controls.
  await page.evaluate(async () => {
    const n = window.__n;
    const S = n._vmmoss.S;
    S.view = { zoom: 2.4, panX: -S.canvasW * 0.35, panY: -S.canvasH * 0.08 };
    S.sel = "box_3";
    n._vmmoss.renderZoomBadge(); n._vmmoss.rebuildRows(); n._vmmoss.draw();
    await new Promise((r) => setTimeout(r, 350));
  });
  await page.waitForTimeout(200);
  const zoomBox = await page.locator(".vmmoss").boundingBox();
  if (zoomBox) {
    await page.screenshot({
      path: path.join(OUT, "ui_zoom.png"),
      clip: { x: Math.max(0, zoomBox.x - 8), y: Math.max(0, zoomBox.y - 4), width: zoomBox.width + 16, height: zoomBox.height + 8 },
    });
  }
  await page.evaluate(() => { window.__n._vmmoss.resetView(); });

  const mossErrors = errors.filter((e) => /MOSS|vmmoss|VMMOSS/i.test(e));
  check("无本节点相关控制台错误", mossErrors.length === 0, mossErrors.join(" | ").slice(0, 200));

  const passed = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n合计：${passed}/${results.length} 通过`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((err) => {
  console.error("UI 测试异常：", err);
  process.exit(2);
});
