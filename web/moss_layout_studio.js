/**
 * VM MOSS Layout Studio — in-node canvas, bilingual UI, Skill JSON bridge.
 *
 * Contract highlights
 * -------------------
 * - `layout_data` keeps the single source of truth for the canvas (v2 schema).
 * - `getEffectiveBoxes()` decides canvas draw order, hit-test order and compile order.
 * - Aspect maths mirrors `moss_layout.py::sync_box_aspect_ratio` line by line.
 * - Skill JSON import/export mirrors `moss_layout.py::parse_skill_json` / `build_draft_json`.
 *
 * The pure helpers at the top are exported so tests can exercise them in Node
 * without a browser (`tests/moss_frontend.cjs`).
 */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { createPromptAutocomplete, createAutocompleteLoader } from "./moss_autocomplete.js";

const loadAutocomplete = createAutocompleteLoader(
  () => api.getExtensions(), (url) => import(url), globalThis.location?.href,
);

export const NODE_ID = "VMMOSSLayoutStudio";

export const PRESETS = {
  "Custom (自定义宽高 / Custom W×H)": null,
  "Poster 3:4 Standard (896x1152)": [896, 1152],
  "Poster 3:4 HD (1152x1536)": [1152, 1536],
  "Poster 2:3 Standard (832x1216)": [832, 1216],
  "Poster 2:3 HD (1024x1536)": [1024, 1536],
  "Mobile 9:16 Standard (768x1344)": [768, 1344],
  "Mobile 9:16 HD (1088x1920)": [1088, 1920],
  "Infographic 1:2 Long (768x1536)": [768, 1536],
  "Infographic 1:2 HD (896x1792)": [896, 1792],
  "Print A4 Portrait (896x1264)": [896, 1264],
  "Print A4 HD (1216x1728)": [1216, 1728],
  "Square 1:1 Standard (1024x1024)": [1024, 1024],
  "Square 1:1 HD (1536x1536)": [1536, 1536],
  "Landscape 4:3 (1152x896)": [1152, 896],
  "Campaign 3:2 HD (1536x1024)": [1536, 1024],
  "Banner 16:9 Standard (1344x768)": [1344, 768],
  "Banner 16:9 HD (1920x1088)": [1920, 1088],
  "Ultrawide 21:9 (1536x640)": [1536, 640],
};
export const PRESET_CUSTOM = "Custom (自定义宽高 / Custom W×H)";

export const SYNC_SMART = "Smart (文字/主体保比例，背景铺满)";
export const SYNC_KEEP = "Keep Box Aspect (所有框保持自身长宽比)";
export const SYNC_CENTER = "Center Layout (居中扩展，缩小时整体适配)";
export const SYNC_STRETCH = "Stretch with Canvas (随画布比例弹性拉伸)";
export const LAYER_AUTO = "Auto (背景->物体->角色->文字置顶)";
export const LAYER_MANUAL = "Manual (严格按列表手动顺序)";
export const META_NONE = "none (不写入 meta)";

const LABEL_ORDER = { object: 0, character: 1, text: 2 };
const LABEL_STYLE = {
  object: { tag: "O", color: "#4a90ff", fill: "rgba(74,144,255,0.16)" },
  character: { tag: "C", color: "#35c46a", fill: "rgba(53,196,106,0.16)" },
  text: { tag: "T", color: "#ff9f43", fill: "rgba(255,159,67,0.18)" },
};

const ALIGN_PX = 16;
const MIN_SIDE = 256;
const MAX_SIDE = 4096;
const MIN_BOX_PX = 8;
const SNAP_PX = 8;
const CANVAS_MAX_H = 360;
const CANVAS_MIN_H = 170;
const ROW_H = 26;
const LIST_MAX_H = 168;
const LARGE_BG_AREA = 0.70;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// ---------------------------------------------------------------------------
// Bilingual dictionary (zh/en must expose the same key set — tested)
// ---------------------------------------------------------------------------
export const I18N = {
  zh: {
    title: "VM MOSS 海报布局工作台",
    centerSyncTip: "居中扩展：前景保持像素尺寸，背景框铺满；缩小时整套布局等比适配。参考图同步居中，留白不自动扩图。",
    megapixels: "总像素（MP）", applyPixels: "应用",
    pixelsTip: "1 MP = 100万像素。按当前宽高比换算，宽高按 16 对齐；框沿用比例同步选项。",
    pixelsInvalid: "无法应用：请输入 0.01～32 MP，换算后宽高须在 256～4096 内。",
    pixelsActual: "{w}×{h} · {mp} MP",
    toggle: "EN",
    toggleTitle: "切换界面语言 / Switch UI language",
    addText: "+ 文字框", addChar: "+ 角色框", addObj: "+ 物体框",
    addTextTip: "新建文字框（Text，永远置顶）",
    addCharTip: "新建角色框（Character，激活人体先验）",
    addObjTip: "新建物体框（Object，背景/底板/装饰）",
    importJson: "📥 导入 JSON", importTip: "粘贴 Skill Draft / 编译后 JSON，直接回填画布",
    exportJson: "📤 导出 Draft", exportTip: "导出可读草稿 JSON（abs + xyxy），可再喂给 Skill",
    snapOn: "网格吸附 开", snapOff: "网格吸附 关", snapTip: "8px 网格吸附",
    centerH: "水平居中", centerV: "垂直居中",
    matchW: "等宽", matchH: "等高", distH: "水平等距", distV: "垂直等距",
    clear: "清空", clearTip: "清空全部框", delete: "删除",
    centerHTip: "选中的框（未选中则全部）水平居中",
    centerVTip: "选中的框（未选中则全部）垂直居中",
    matchWTip: "以选中框为基准等宽；锁定比例的框按原比例同步高度",
    matchHTip: "以选中框为基准等高；锁定比例的框按原比例同步宽度",
    distHTip: "至少 3 个框：水平方向等间距分布",
    distVTip: "至少 3 个框：垂直方向等间距分布",
    empty: "暂无框 — 点「+ 文字框」开始，或双击画布空白处新建文字框",
    refLabel: "参考图 {w}×{h}", refMatch: "一键匹配 {w}×{h}", refOpacity: "底图",
    refPending: "参考图已连接：运行一次后显示底图",
    refTip: "画布底图仅作对位参考，不会进入提示词",
    footCanvas: "画布", footBase: "基准", footBoxes: "{n} 框 / {v} 可见",
    footOrder: "输出顺序", linked: "尺寸来自连线", emptyPrompt: "空画布 → 输出 global_prompt 纯文本",
    externalOn: "外部 JSON：{mode}", noText: "{n} 个文字框缺少渲染文字",
    labelText: "文字", labelChar: "角色", labelObj: "物体",
    rowText: "渲染文字", rowStyle: "字体/样式描述", rowCaption: "画面描述",
    rowTextTip: "要渲染的具体文字，支持 \\n 换行",
    rowStyleTip: "字体样式与排版描述；留空则按位置和比例自动生成",
    rowCaptionTip: "该区域的画面描述（caption）",
    visTip: "显示 / 隐藏（隐藏的框不进入 layout_prompt）",
    lockTip: "锁定长宽比：改画布比例或拖角点时保持物理比例",
    typeTip: "元素类型：Text 文字 / Character 角色 / Object 物体背景",
    gripTip: "按住上下拖动调整层级（越靠上 = 越前景）",
    delTip: "删除该框",
    modalImport: "导入 Skill JSON", modalExport: "导出 Draft JSON",
    importHint: "支持 Draft（abs + xyxy）、编译后（abs_centralized + yxyx）与纯 caption；可含 ```json 代码块。",
    exportHint: "100% 兼容 moss-image-prompt-enhancer 的草稿格式，可粘贴回 Skill 或 LLM 继续迭代。",
    replaceCanvas: "覆盖画布", mergeCanvas: "追加到画布", cancel: "取消",
    copy: "复制", download: "下载", close: "关闭", copied: "已复制",
    importOk: "已导入 {n} 个框 · {w}×{h}", importCaption: "已导入全局描述",
    importFail: "无法识别该 JSON：请检查是否为 Skill Draft 或编译后的布局 JSON",
    importScriptError: "这是 Python 脚本，不是布局 JSON。请粘贴脚本生成的 layout.json 文件内容；原画布未修改。",
    importEmpty: "该 JSON 没有可用的框", exportEmpty: "画布为空：导出的是空布局",
    placeholderText: "渲染文字", placeholderStyle: "字体/样式描述", placeholderCaption: "画面描述",
    placeholderGlobal: "整体画面、背景、光影与排版风格描述 (summary.caption)...",
    compiledSizeError: "Compiled JSON 缺少源尺寸且坐标超出当前画布；请补充 width/height 或选择正确画布。",
    statusReady: "就绪",
    canvasTip: "拖拽移动 · 角点缩放 · Delete 删除 · 方向键微调 · 双击空白处新建文字框",
    zoomTip: "滚轮缩放 · 中键 / 空格+左键拖动平移 · 点击徽章或按 0 复位",
    zoomBadge: "🔍 {p}% ↺",
    zoomResetTip: "复位到 100% 居中视图（快捷键 0）",
    thirds: "三分线",
    thirdsTip: "显示三分构图参考线（1/3、2/3，纯视觉参考，不写入提示词）",
    golden: "黄金线",
    goldenTip: "显示黄金分割参考线（0.382、0.618 与 4 个焦点，纯视觉参考）",
    guidesSnapTip: "网格吸附开启时，拖动框靠近参考线会自动吸附",
    inspector: "展开编辑",
    inspectorTip: "展开全宽多行编辑（渲染文字与样式描述）",
    inspectorTitle: "展开编辑区",
    inspectorText: "渲染文字 (Exact Text)",
    inspectorStyle: "样式 / 画面描述 (Style / Caption)",
    inspectorTextTip: "要渲染的具体文字，支持回车换行",
    inspectorStyleTip: "字体样式或该区域的画面描述；英文候选词需安装并启用 Custom Scripts 的 Text Autocomplete 和词库",
    inspectorCollapse: "收起",
    inspectorFollow: "切换选中框时此处自动跟随",
    textLink: "文案来自连线",
    hideAll: "👁 全部隐藏",
    showAll: "🚫 全部显示",
    hideAllTip: "一键隐藏所有框，观察底图与整体构图",
    showAllTip: "一键恢复显示所有框",
    paletteLabel: "全局色板",
    paletteTip: "写入 summary.palette，控制整张海报的主视觉配色",
    paletteTheme: "配色主题",
    paletteAddTip: "添加全局主色",
    paletteEmpty: "未设色",
    paletteThemeCustom: "自定义 …",
    paletteLayer: "图层色板",
    paletteLayerTip: "为该框设置局部配色（item.palette，最多 4 色）",
    paletteQuick: "海报常用色",
    paletteCustom: "自由取色 / 色值",
    paletteInputPlaceholder: "#FF5733 或 ivory",
    paletteAddColor: "加入",
    paletteRemove: "移除该颜色",
    paletteClearBox: "清空色板",
    paletteFull: "最多 4 个颜色",
    paletteInvalid: "无法识别该颜色",
    paletteDuplicate: "该颜色已在色板中",
    paletteDotsTip: "已设 {n} 个颜色",
    paletteRemoveGlobal: "从全局色板移除",
    // V2.2 eyedropper + palette extraction
    pickColor: "吸管",
    pickColorTip: "吸取屏幕任意位置的颜色，加入全局色板",
    pickColorLayer: "吸管取色",
    pickColorLayerTip: "吸取颜色加入该框色板",
    pickCanvasHint: "吸管模式：移动取色，左键确认，Esc / 右键退出",
    pickFallback: "当前环境不支持全屏吸管，已切换到画布吸管",
    pickDuplicate: "该颜色已在色板中",
    pickFull: "色板已满",
    extractPalette: "提取配色",
    extractPaletteTip: "从参考图自动提取 4 个主色写入全局色板",
    extractNoRef: "需先接入参考图并运行",
    extractFail: "参考图取色失败",
    extractDone: "已提取 {n} 个主色",
  },
  en: {
    title: "VM MOSS Layout Studio",
    centerSyncTip: "Center Layout: preserve foreground pixels, fill full-canvas background boxes; shrink the whole layout to fit smaller canvases. Reference padding is not outpainting.",
    megapixels: "Total pixels (MP)", applyPixels: "Apply",
    pixelsTip: "1 MP = 1 million pixels. Keep the current canvas ratio, align sides to 16; boxes follow Aspect Sync.",
    pixelsInvalid: "Cannot apply: enter 0.01–32 MP; resulting sides must be within 256–4096.",
    pixelsActual: "{w}×{h} · {mp} MP",
    toggle: "中文",
    toggleTitle: "切换界面语言 / Switch UI language",
    addText: "+ Text", addChar: "+ Character", addObj: "+ Object",
    addTextTip: "Add a text box (always on top)",
    addCharTip: "Add a character box (activates human priors)",
    addObjTip: "Add an object box (background / plate / prop)",
    importJson: "📥 Import JSON", importTip: "Paste Skill draft or compiled JSON to fill the canvas",
    exportJson: "📤 Export Draft", exportTip: "Export a readable draft (abs + xyxy) for another Skill pass",
    snapOn: "Snap: On", snapOff: "Snap: Off", snapTip: "8px grid snapping",
    centerH: "Center H", centerV: "Center V",
    matchW: "Match W", matchH: "Match H", distH: "Distribute H", distV: "Distribute V",
    clear: "Clear", clearTip: "Remove every box", delete: "Delete",
    centerHTip: "Centre the selected boxes (or all) horizontally",
    centerVTip: "Centre the selected boxes (or all) vertically",
    matchWTip: "Match the selected box width; locked boxes scale height by aspect",
    matchHTip: "Match the selected box height; locked boxes scale width by aspect",
    distHTip: "Even horizontal spacing (needs 3+ boxes)",
    distVTip: "Even vertical spacing (needs 3+ boxes)",
    empty: "No boxes yet — use “+ Text”, or double-click an empty canvas area",
    refLabel: "Ref {w}×{h}", refMatch: "Match {w}×{h}", refOpacity: "Backdrop",
    refPending: "Reference connected: run once to load the backdrop",
    refTip: "The backdrop is only a visual guide and never enters the prompt",
    footCanvas: "Canvas", footBase: "Base", footBoxes: "{n} boxes / {v} visible",
    footOrder: "Order", linked: "Size from link", emptyPrompt: "Empty canvas → outputs global_prompt text",
    externalOn: "External JSON: {mode}", noText: "{n} text boxes have no literal text",
    labelText: "Text", labelChar: "Character", labelObj: "Object",
    rowText: "Exact text", rowStyle: "Style caption", rowCaption: "Caption",
    rowTextTip: "Literal characters to render; \\n starts a new line",
    rowStyleTip: "Typography and surface treatment; left blank it is generated from box shape",
    rowCaptionTip: "Visible description of this region (caption)",
    visTip: "Show / hide (hidden boxes are excluded from layout_prompt)",
    lockTip: "Lock aspect: keep the physical ratio while resizing or changing canvas",
    typeTip: "Element type: Text / Character / Object",
    gripTip: "Drag up or down to change stacking order (higher = more foreground)",
    delTip: "Remove this box",
    modalImport: "Import Skill JSON", modalExport: "Export Draft JSON",
    importHint: "Draft (abs + xyxy), compiled (abs_centralized + yxyx) or a plain caption; ```json fences are fine.",
    exportHint: "100% compatible with moss-image-prompt-enhancer drafts; paste it back into the Skill or an LLM.",
    replaceCanvas: "Replace canvas", mergeCanvas: "Merge into canvas", cancel: "Cancel",
    copy: "Copy", download: "Download", close: "Close", copied: "Copied",
    importOk: "Imported {n} boxes · {w}×{h}", importCaption: "Global caption imported",
    importFail: "Unrecognised JSON: expected a Skill draft or a compiled layout prompt",
    importScriptError: "This is a Python script, not layout JSON. Paste the contents of the generated layout.json file; the canvas is unchanged.",
    importEmpty: "This JSON contains no usable boxes", exportEmpty: "Empty canvas: exporting an empty layout",
    placeholderText: "Exact text", placeholderStyle: "Style caption", placeholderCaption: "Caption",
    placeholderGlobal: "Overall scene, background, lighting and layout style (summary.caption)...",
    compiledSizeError: "Compiled JSON exceeds the canvas without source dimensions; provide width/height or select the correct canvas.",
    statusReady: "Ready",
    canvasTip: "Drag to move · corners resize · Delete removes · arrows nudge · double-click to add text",
    zoomTip: "Wheel zooms · middle-drag or Space+drag pans · click the badge (or press 0) to reset",
    zoomBadge: "🔍 {p}% ↺",
    zoomResetTip: "Reset to 100% centred view (shortcut 0)",
    thirds: "Thirds",
    thirdsTip: "Show the rule-of-thirds guides (1/3, 2/3) — visual only, never compiled",
    golden: "Golden",
    goldenTip: "Show golden-ratio guides (0.382, 0.618 and the four power points) — visual only",
    guidesSnapTip: "With snapping on, boxes snap to the enabled guides while dragging",
    inspector: "Expand",
    inspectorTip: "Open the full-width multi-line editor for text and style",
    inspectorTitle: "Text inspector",
    inspectorText: "Exact text",
    inspectorStyle: "Style / Caption",
    inspectorTextTip: "Literal characters to render; Enter starts a new line",
    inspectorStyleTip: "Typography or region description; word suggestions require Custom Scripts Text Autocomplete and a word list",
    inspectorCollapse: "Collapse",
    inspectorFollow: "Follows the selected box",
    textLink: "Copy from link",
    hideAll: "👁 Hide All",
    showAll: "🚫 Show All",
    hideAllTip: "Hide every box to inspect the backdrop and overall composition",
    showAllTip: "Bring every box back",
    paletteLabel: "Global palette",
    paletteTip: "Written to summary.palette; drives the poster's overall colour scheme",
    paletteTheme: "Theme",
    paletteAddTip: "Add a global colour",
    paletteEmpty: "no colours",
    paletteThemeCustom: "Custom …",
    paletteLayer: "Layer palette",
    paletteLayerTip: "Per-box colours (item.palette, up to 4)",
    paletteQuick: "Poster colours",
    paletteCustom: "Colour picker / value",
    paletteInputPlaceholder: "#FF5733 or ivory",
    paletteAddColor: "Add",
    paletteRemove: "Remove this colour",
    paletteClearBox: "Clear palette",
    paletteFull: "4 colours max",
    paletteInvalid: "Unrecognised colour",
    paletteDuplicate: "Already in this palette",
    paletteDotsTip: "{n} colours",
    paletteRemoveGlobal: "Remove from the global palette",
    // V2.2 eyedropper + palette extraction
    pickColor: "Pick",
    pickColorTip: "Sample a colour from anywhere on screen and add it to the global palette",
    pickColorLayer: "Eyedropper",
    pickColorLayerTip: "Sample a colour into this box's palette",
    pickCanvasHint: "Eyedropper: move to sample, click to confirm, Esc or right-click to exit",
    pickFallback: "Screen eyedropper unavailable here — switched to the canvas eyedropper",
    pickDuplicate: "Already in this palette",
    pickFull: "Palette is full",
    extractPalette: "Extract Palette",
    extractPaletteTip: "Pull 4 dominant colours from the reference image into the global palette",
    extractNoRef: "Connect a reference image and run first",
    extractFail: "Could not read colours from the reference image",
    extractDone: "Extracted {n} colours",
  },
};

export function translate(lang, key, vars) {
  const table = I18N[lang === "zh" ? "zh" : "en"];
  let text = table[key] ?? I18N.zh[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

// ---------------------------------------------------------------------------
// Pure geometry helpers
// ---------------------------------------------------------------------------
function roundEven(value) {
  const lower = Math.floor(value);
  if (value - lower === 0.5) return lower % 2 === 0 ? lower : lower + 1;
  return Math.round(value);
}

export function alignedSize(value, fallback = 1024) {
  let size = roundEven(num(value, fallback));
  size = clamp(Number.isFinite(size) ? size : fallback, MIN_SIDE, MAX_SIDE);
  return roundEven(size / ALIGN_PX) * ALIGN_PX;
}

// One-shot sizing: serialized width/height remain the backend contract.
export function sizeForMegapixels(width, height, megapixels) {
  if (![width, height, megapixels].every(v => typeof v === "number" && Number.isFinite(v)) ||
      width <= 0 || height <= 0 || megapixels < 0.01 || megapixels > 32) return null;
  const scale = Math.sqrt(megapixels * 1_000_000 / (width * height));
  const w = roundEven(width * scale / ALIGN_PX) * ALIGN_PX;
  const h = roundEven(height * scale / ALIGN_PX) * ALIGN_PX;
  // Reject instead of clamping one side and silently distorting the ratio.
  return w >= MIN_SIDE && w <= MAX_SIDE && h >= MIN_SIDE && h <= MAX_SIDE ? { w, h } : null;
}

export function splitTags(value) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(/[,，;；\n]+/);
  const out = [];
  for (const part of parts) {
    const tag = String(part).trim();
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

// ---------------------------------------------------------------------------
// V2.1 canvas view (zoom / pan) — pure maths, mirrored by tests
// ---------------------------------------------------------------------------
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
const ZOOM_EPS = 1.001;

/** Clamp zoom/pan so the canvas never reveals an empty margin. */
export function clampView(zoom, panX, panY, cw, ch) {
  const z = clamp(num(zoom, ZOOM_MIN), ZOOM_MIN, ZOOM_MAX);
  const width = Math.max(1, num(cw, 1));
  const height = Math.max(1, num(ch, 1));
  if (z <= ZOOM_EPS) return { zoom: 1, panX: 0, panY: 0 };
  return {
    zoom: z,
    panX: clamp(num(panX, 0), width * (1 - z), 0),
    panY: clamp(num(panY, 0), height * (1 - z), 0),
  };
}

/** Zoom around a canvas-local point (mx, my), both in unscaled CSS px. */
export function zoomAtPoint(view, mx, my, factor, cw, ch) {
  const zoom = num(view?.zoom, 1);
  const next = clamp(zoom * num(factor, 1), ZOOM_MIN, ZOOM_MAX);
  const ratio = next / Math.max(zoom, 1e-6);
  return clampView(
    next,
    num(mx, 0) - (num(mx, 0) - num(view?.panX, 0)) * ratio,
    num(my, 0) - (num(my, 0) - num(view?.panY, 0)) * ratio,
    cw, ch,
  );
}

/** Invert the view transform: canvas-local CSS px → canvas px + normalised. */
export function viewToCanvas(view, localX, localY, cw, ch) {
  const zoom = Math.max(num(view?.zoom, 1), 1e-6);
  const width = Math.max(1, num(cw, 1));
  const height = Math.max(1, num(ch, 1));
  const px = clamp((num(localX, 0) - num(view?.panX, 0)) / zoom, 0, width);
  const py = clamp((num(localY, 0) - num(view?.panY, 0)) / zoom, 0, height);
  return { x: px / width, y: py / height, px, py };
}

// ---------------------------------------------------------------------------
// V2.3 composition guides (pure maths, mirrored by tests)
// ---------------------------------------------------------------------------
export const GUIDE_THIRDS = [1 / 3, 2 / 3];
/** 1 − φ⁻¹ and φ⁻¹, φ = (√5 − 1) / 2. */
export const GUIDE_GOLDEN = [1 - 0.6180339887498949, 0.6180339887498949];
export const GUIDE_SNAP_PX = 6;

/** Ratios (shared by both axes) for the enabled guides, with their kind. */
export function guideRatios(guides) {
  const out = [];
  if (guides?.thirds) for (const ratio of GUIDE_THIRDS) out.push({ ratio, kind: "thirds" });
  if (guides?.golden) for (const ratio of GUIDE_GOLDEN) out.push({ ratio, kind: "golden" });
  return out;
}

/**
 * Snap a box to the enabled guides: centre or either edge within `tolerance` px.
 * Returns the adjusted centre in normalised coordinates.
 */
export function snapBoxToGuides(box, W, H, guides, tolerance = GUIDE_SNAP_PX) {
  const cx = num(box?.cx, 0.5);
  const cy = num(box?.cy, 0.5);
  const width = Math.max(1, num(W, 1));
  const height = Math.max(1, num(H, 1));
  const w = num(box?.w, 0);
  const h = num(box?.h, 0);
  const ratios = guideRatios(guides).map((entry) => entry.ratio);
  if (!ratios.length) return { cx, cy };

  const nearest = (features, total) => {
    let best = null;
    for (const feature of features) {
      const px = feature * total;
      for (const ratio of ratios) {
        const delta = ratio * total - px;
        if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best))) best = delta;
      }
    }
    return best;
  };

  const dx = nearest([cx, cx - w / 2, cx + w / 2], width);
  const dy = nearest([cy, cy - h / 2, cy + h / 2], height);
  return { cx: cx + (dx === null ? 0 : dx / width), cy: cy + (dy === null ? 0 : dy / height) };
}

// ---------------------------------------------------------------------------
// V2.1 colour palette — themes, 16 quick poster colours, hex normalisation
// ---------------------------------------------------------------------------
export const THEME_CUSTOM = "custom";

export const PALETTE_THEMES = {
  tech_neon: {
    zh: "科技深蓝霓虹", en: "Tech Neon",
    colors: ["#0F172A", "#1E40AF", "#38BDF8", "#F8FAFC"],
  },
  black_gold: {
    zh: "黑金奢华海报", en: "Black & Gold",
    colors: ["#09090B", "#27272A", "#F59E0B", "#FEF3C7"],
  },
  warm_editorial: {
    zh: "极简奶油杂志", en: "Warm Editorial",
    colors: ["#FAF8F5", "#D6CFC7", "#78716C", "#1C1917"],
  },
  oriental_crimson: {
    zh: "国风朱砂墨色", en: "Oriental Crimson",
    colors: ["#7F1D1D", "#DC2626", "#FDE68A", "#171717"],
  },
  fresh_infographic: {
    zh: "清新生态信息图", en: "Fresh Infographic",
    colors: ["#ECFDF5", "#10B981", "#047857", "#064E3B"],
  },
};

export const QUICK_COLORS = [
  "#FFFFFF", "#111827", "#F59E0B", "#DC2626",
  "#2563EB", "#06B6D4", "#9333EA", "#10B981",
  "#FEF3C7", "#6B8E78", "#F472B6", "#FDE047",
  "#FB923C", "#4B5563", "#065F46", "#E11D48",
];

/** Minimal CSS colour names so palettes typed as words still render. */
const COLOR_NAMES = {
  white: "#FFFFFF", black: "#000000", ivory: "#FFFFF0", cream: "#FFFDD0",
  gold: "#FFD700", silver: "#C0C0C0", gray: "#808080", grey: "#808080",
  red: "#FF0000", crimson: "#DC143C", maroon: "#800000", pink: "#FFC0CB",
  orange: "#FFA500", coral: "#FF7F50", yellow: "#FFFF00", lime: "#00FF00",
  green: "#008000", emerald: "#50C878", mint: "#98FF98", teal: "#008080",
  cyan: "#00FFFF", skyblue: "#87CEEB", blue: "#0000FF", navy: "#000080",
  purple: "#800080", violet: "#8A2BE2", lavender: "#E6E6FA", magenta: "#FF00FF",
  brown: "#A52A2A", beige: "#F5F5DC", charcoal: "#36454F", slate: "#708090",
  sand: "#E8DCC4", amber: "#FFBF00", bronze: "#CD7F32",
};

/** Normalise `#abc` / `#AABBCC` / common colour words to `#RRGGBB`. */
export function normalizeHex(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  return COLOR_NAMES[key] || null;
}

/** Append a colour (deduped, capped) and return a new list. */
export function pushPaletteColor(list, color, max = 4) {
  const out = Array.isArray(list) ? list.slice() : [];
  const value = normalizeHex(color) || String(color ?? "").trim();
  if (!value) return out;
  if (out.some((entry) => String(entry).toUpperCase() === value.toUpperCase())) return out;
  if (out.length >= max) return out;
  out.push(value);
  return out;
}

/** True when at least one box is still visible (the button then hides all). */
export function nextAllVisible(boxes) {
  return !(Array.isArray(boxes) && boxes.some((box) => box.visible));
}

// ---------------------------------------------------------------------------
// V2.2 eyedropper / reference palette extraction
// ---------------------------------------------------------------------------
/** Clamp a channel and emit `#RRGGBB`. */
export function hexFromRgb(r, g, b) {
  return "#" + [r, g, b]
    .map((v) => clamp(Math.round(num(v, 0)), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Quantise RGBA pixels into at most `maxColors` visually distinct `#RRGGBB`.
 *
 * 4 bits per channel (4096 buckets) keeps the histogram cheap; each bucket is
 * averaged back to true RGB, then buckets are taken by population with a
 * minimum RGB distance so the result reads as separate swatches rather than
 * four near-identical greys.
 */
export function extractDominantColorsFromPixels(rgbaData, maxColors = 4) {
  const data = rgbaData || [];
  const limit = Math.max(1, Math.floor(num(maxColors, 4)) || 4);
  const buckets = new Map();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    // Exclude clipped highlights / black noise, retaining ordinary light and dark colours.
    if (Math.min(r, g, b) >= 250 || Math.max(r, g, b) <= 5) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let entry = buckets.get(key);
    if (!entry) {
      entry = { count: 0, rSum: 0, gSum: 0, bSum: 0 };
      buckets.set(key, entry);
    }
    entry.count += 1;
    entry.rSum += r;
    entry.gSum += g;
    entry.bSum += b;
  }
  if (!buckets.size) return [];

  const candidates = [...buckets.values()]
    .map((entry) => ({
      count: entry.count,
      r: Math.round(entry.rSum / entry.count),
      g: Math.round(entry.gSum / entry.count),
      b: Math.round(entry.bSum / entry.count),
    }))
    .sort((a, b) => b.count - a.count);

  const chosen = [];
  const minDistSq = 42 * 42;
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    const tooClose = chosen.some(
      (picked) => (picked.r - candidate.r) ** 2 + (picked.g - candidate.g) ** 2
        + (picked.b - candidate.b) ** 2 < minDistSq,
    );
    if (!tooClose) chosen.push(candidate);
  }
  // Flat or very low-contrast images cannot satisfy the distance rule; top up
  // with the next most popular buckets so the caller still gets a usable set.
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  return chosen.map((c) => hexFromRgb(c.r, c.g, c.b));
}

/**
 * Pick a colour with the native full-screen EyeDropper when available,
 * otherwise hand control to the caller's in-canvas fallback.
 *
 * @param {(hex: string) => void} onPicked
 * @param {string|{targetLabel?: string, fallback?: Function, eyeDropper?: Function}} target
 * @returns {Promise<"picked"|"empty"|"cancelled"|"fallback"|"unsupported">}
 */
export async function pickColorWithEyedropper(onPicked, target = "global") {
  const options = typeof target === "string" ? { targetLabel: target } : (target || {});
  const EyeDropperCtor = "eyeDropper" in options
    ? options.eyeDropper
    : globalThis.window?.EyeDropper;
  if (typeof EyeDropperCtor === "function") {
    try {
      const dropper = new EyeDropperCtor();
      const result = await dropper.open();
      const hex = normalizeHex(result?.sRGBHex);
      if (!hex) return "empty";
      onPicked?.(hex);
      return "picked";
    } catch (err) {
      // Esc / explicit cancel must stay silent and must not repaint a palette.
      if (err?.name === "AbortError") return "cancelled";
      // Permission denied, insecure context, unsupported platform → fall through.
    }
  }
  if (typeof options.fallback === "function") {
    options.fallback();
    return "fallback";
  }
  return "unsupported";
}

export function setAllVisible(boxes, visible) {
  return (Array.isArray(boxes) ? boxes : []).map((box) => ({ ...box, visible: !!visible }));
}

function validReferenceSize(value) {
  return Array.isArray(value) && value.length === 2 && value.every(v => typeof v === "number" && Number.isFinite(v) && v > 0);
}

export function syncReferenceSize(state, width, height, mode) {
  if (mode !== SYNC_CENTER) { delete state.reference_size; return; }
  const size = validReferenceSize(state.reference_size) ? state.reference_size : [state.base_width, state.base_height];
  const scale = Math.min(1, width / state.base_width, height / state.base_height);
  state.reference_size = size.map(v => v * scale);
}

export function referenceRect(state, width, height, mode) {
  if (mode !== SYNC_CENTER || !validReferenceSize(state.reference_size)) return [0, 0, width, height];
  const w = state.reference_size[0] * width / state.base_width;
  const h = state.reference_size[1] * height / state.base_height;
  return [(width - w) / 2, (height - h) / 2, w, h];
}

export function syncBoxAspectRatio(box, W0, H0, W1, H1, mode) {
  let { cx, cy, w, h } = box;
  cx = num(cx, 0.5); cy = num(cy, 0.5); w = num(w, 0); h = num(h, 0);
  if (W0 <= 0 || H0 <= 0 || W1 <= 0 || H1 <= 0 || (W0 === W1 && H0 === H1)) return { cx, cy, w, h };
  if (w <= 0 || h <= 0) return { cx, cy, w, h };

  if (mode === SYNC_CENTER) {
    // Only true full-canvas objects are backgrounds; large foregrounds still move together.
    if (box.label === "object" && w >= 0.98 && h >= 0.98 && Math.abs(cx - 0.5) <= 0.01 && Math.abs(cy - 0.5) <= 0.01) {
      return { cx: 0.5, cy: 0.5, w: 1, h: 1 };
    }
    const scale = Math.min(1, W1 / W0, H1 / H0);
    return { cx: 0.5 + (cx - 0.5) * W0 * scale / W1,
      cy: 0.5 + (cy - 0.5) * H0 * scale / H1,
      w: w * W0 * scale / W1, h: h * H0 * scale / H1 };
  }
  const isLargeBg = box.label === "object" && w * h >= LARGE_BG_AREA;
  let keepAspect;
  if (mode === SYNC_STRETCH && !box.lock_aspect) keepAspect = false;
  else if (mode === SYNC_KEEP || box.lock_aspect) keepAspect = true;
  else keepAspect = !isLargeBg;
  if (!keepAspect) return { cx, cy, w, h };

  let rBox = num(box.orig_aspect, 0);
  if (rBox <= 0) rBox = (w * W0) / Math.max(h * H0, 1e-6);
  const targetNormRatio = rBox * (H1 / W1);
  const areaNorm = w * h;
  let wNew = Math.sqrt(Math.max(areaNorm, 1e-12) * targetNormRatio);
  let hNew = Math.sqrt(Math.max(areaNorm, 1e-12) / Math.max(targetNormRatio, 1e-6));
  const scaleDown = Math.min(1, 0.98 / Math.max(wNew, 1e-6), 0.98 / Math.max(hNew, 1e-6));
  wNew *= scaleDown; hNew *= scaleDown;
  return {
    cx: Math.min(Math.max(cx, wNew / 2), 1 - wNew / 2),
    cy: Math.min(Math.max(cy, hNew / 2), 1 - hNew / 2),
    w: wNew, h: hNew,
  };
}

/** Effective draw/compile order (F05). Hidden boxes are kept for editing. */
export function effectiveOrder(boxes, mode) {
  if (mode === LAYER_MANUAL) return boxes.slice();
  return boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => {
      const ga = LABEL_ORDER[a.box.label] ?? 0;
      const gb = LABEL_ORDER[b.box.label] ?? 0;
      if (ga !== gb) return ga - gb;
      const aa = a.box.w * a.box.h;
      const ab = b.box.w * b.box.h;
      if (aa !== ab) return ab - aa;
      return a.index - b.index;
    })
    .map(({ box }) => box);
}

/** Stable T1/C1/O1 labels in list order (independent from z-sorting). */
export function displayTags(boxes) {
  const counters = { object: 0, character: 0, text: 0 };
  const tags = {};
  for (const box of boxes) {
    const label = box.label in counters ? box.label : "object";
    counters[label] += 1;
    tags[box.id] = `${LABEL_STYLE[label].tag}${counters[label]}`;
  }
  return tags;
}

/**
 * Resize geometry for one handle (F03).
 * Locked boxes always keep `orig_aspect`, including at the minimum size, where
 * the short edge is 8px and the long edge follows the ratio (4:1 → 32×8).
 */
export function resizeGeometry(box, handle, point, W, H, snap) {
  const east = handle.includes("e");
  const south = handle.includes("s");
  const ax = east ? box.cx - box.w / 2 : box.cx + box.w / 2;
  const ay = south ? box.cy - box.h / 2 : box.cy + box.h / 2;

  const snapNorm = (v, total) => (snap ? Math.round(v / (SNAP_PX / total)) * (SNAP_PX / total) : v);
  let px = clamp(snapNorm(point.x, W), 0, 1);
  let py = clamp(snapNorm(point.y, H), 0, 1);

  const minW = MIN_BOX_PX / W;
  const minH = MIN_BOX_PX / H;
  const availW = east ? 1 - ax : ax;
  const availH = south ? 1 - ay : ay;
  if (availW <= 0 || availH <= 0) return { cx: box.cx, cy: box.cy, w: box.w, h: box.h };

  let w;
  let h;
  if (box.lock_aspect) {
    const ratio = Math.max(num(box.orig_aspect, 1), 1e-6) * (H / W); // normalised w/h
    const desiredW = Math.abs(px - ax);
    const desiredH = Math.abs(py - ay);
    // Drive by the dimension the pointer pushed further; never below the coupled minimum.
    const driven = Math.max(desiredW, desiredH * ratio);
    const coupledMin = Math.max(minW, minH * ratio);
    const maxW = Math.min(availW, availH * ratio);
    w = clamp(driven, Math.min(coupledMin, maxW), maxW);
    h = w / ratio;
  } else {
    w = clamp(Math.abs(px - ax), Math.min(minW, availW), availW);
    h = clamp(Math.abs(py - ay), Math.min(minH, availH), availH);
  }
  return {
    cx: east ? ax + w / 2 : ax - w / 2,
    cy: south ? ay + h / 2 : ay - h / 2,
    w,
    h,
  };
}

export function syncModeValue(value) {
  return value === SYNC_KEEP || value === SYNC_STRETCH || value === SYNC_CENTER ? value : SYNC_SMART;
}

export function normalizeLabel(value) {
  const s = String(value || "").trim().toLowerCase();
  if (s === "text" || s === "title" || s === "font" || s === "文字") return "text";
  if (s === "character" || s === "char" || s === "person" || s === "角色") return "character";
  return "object";
}

/** SHA-1 (sync) so imported ids match Python's hashlib.sha1 prefix exactly. */
export function sha1Hex(message) {
  const bytes = new TextEncoder().encode(String(message));
  const bitLength = bytes.length * 8;
  const blocks = Math.ceil((bytes.length + 9) / 64);
  const buffer = new Uint8Array(blocks * 64);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(blocks * 64 - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(blocks * 64 - 4, bitLength >>> 0, false);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Uint32Array(80);
  for (let block = 0; block < blocks; block++) {
    const offset = block * 64;
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((x << 1) | (x >>> 31)) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((v) => v.toString(16).padStart(8, "0")).join("");
}

export function contentId(label, caption, text, box) {
  const quantize = (v) => Math.floor(num(v) * 1000 + 0.5); // half-up, matches Python
  const seed = [label, caption, text,
    [box.cx, box.cy, box.w, box.h].map(quantize).join(",")].join("|");
  return `imp_${sha1Hex(seed).slice(0, 10)}`;
}

// ---------------------------------------------------------------------------
// Skill JSON parse / draft build (mirrors the Python implementation)
// ---------------------------------------------------------------------------
export function stripFences(raw) {
  let text = String(raw ?? "").trim();
  const fence = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```$/.exec(text);
  if (fence) text = fence[1].trim();
  return text;
}

function jsonObject(text) {
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (err) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const value = JSON.parse(text.slice(start, end + 1));
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (err2) {
      return null;
    }
  }
}

function normalizeBox(raw, W0, H0) {
  if (!raw || typeof raw !== "object") return null;
  const w = Math.abs(clamp(num(raw.w, 0), 0, 1));
  const h = Math.abs(clamp(num(raw.h, 0), 0, 1));
  if (w <= 1e-6 || h <= 1e-6) return null;
  const label = normalizeLabel(raw.label);
  let aspect = num(raw.orig_aspect, 0);
  if (aspect <= 0) aspect = (w * Math.max(W0, 1)) / Math.max(h * Math.max(H0, 1), 1e-6);
  return {
    id: String(raw.id || ""),
    label,
    visible: raw.visible !== false,
    lock_aspect: raw.lock_aspect === undefined ? label !== "object" : !!raw.lock_aspect,
    cx: clamp(num(raw.cx, 0.5), 0, 1),
    cy: clamp(num(raw.cy, 0.5), 0, 1),
    w, h,
    orig_aspect: aspect,
    text: String(raw.text ?? ""),
    caption: String(raw.caption ?? ""),
    tags: splitTags(raw.tags ?? []),
    palette: splitTags(raw.palette ?? []),
  };
}

export function normalizeState(raw, width, height) {
  let data = raw;
  if (typeof data === "string") {
    const text = data.trim();
    if (!text) return { version: 2, base_width: width, base_height: height, boxes: [] };
    try { data = JSON.parse(text); } catch (err) {
      return { version: 2, base_width: width, base_height: height, boxes: [] };
    }
  }
  if (!data || typeof data !== "object") return { version: 2, base_width: width, base_height: height, boxes: [] };
  const baseW = Math.max(1, Math.round(num(data.base_width, width) || width));
  const baseH = Math.max(1, Math.round(num(data.base_height, height) || height));
  const boxes = [];
  const seen = new Set();
  (Array.isArray(data.boxes) ? data.boxes : []).forEach((raw, index) => {
    const box = normalizeBox(raw, baseW, baseH);
    if (!box) return;
    if (!box.id) box.id = `box_${index + 1}`;
    if (seen.has(box.id)) box.id = `${box.id}_${index}`;
    seen.add(box.id);
    boxes.push(box);
  });
  const state = { version: 2, base_width: baseW, base_height: baseH, boxes };
  if (validReferenceSize(data.reference_size)) state.reference_size = data.reference_size.slice();
  for (const key of ["caption", "canvas", "meta", "palette"]) {
    const value = data[key];
    if (value !== undefined && value !== null) state[key] = Array.isArray(value) ? value.slice() : value;
  }
  return state;
}

export function parseSkillJson(raw, dstW, dstH, mode = SYNC_SMART) {
  const text = stripFences(raw);
  if (!text) return null;
  const data = jsonObject(text);
  if (!data) {
    if (text.startsWith("{")) return null;
    return { kind: "caption", caption: text, boxes: [], width: dstW, height: dstH };
  }
  if (!Array.isArray(data.items)) {
    const caption = String(data.caption ?? "").trim();
    if (caption && Object.keys(data).every((k) => k === "caption")) {
      return { kind: "caption", caption, boxes: [], width: dstW, height: dstH };
    }
    return null;
  }

  const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
  const space = String(data.bbox_coord_space || "abs").toLowerCase();
  const fmt = String(data.bbox_format || "xyxy").toLowerCase();
  const srcW = alignedSize(data.width ?? dstW, dstW);
  const srcH = alignedSize(data.height ?? dstH, dstH);
  const compiled = space === "abs_centralized" || space === "absolute_centralized" || fmt === "yxyx";
  const caption = String(summary.caption ?? data.caption ?? "").trim();
  const meta = splitTags(summary.meta ?? []);
  const palette = splitTags(summary.palette ?? []);
  const canvas = String(summary.canvas ?? "").trim() || null;

  const boxes = [];
  const seen = new Set();
  (data.items || []).forEach((item, index) => {
    if (!item || typeof item !== "object" || !Array.isArray(item.bbox) || item.bbox.length !== 4) return;
    const values = item.bbox.map((v) => num(v));
    let x1, y1, x2, y2;
    if (compiled) {
      const [ymin, xmin, ymax, xmax] = values;
      if ((data.width == null && Math.max(Math.abs(xmin), Math.abs(xmax)) > srcW / 2)
          || (data.height == null && Math.max(Math.abs(ymin), Math.abs(ymax)) > srcH / 2)) {
        throw new RangeError("compiledSizeError");
      }
      x1 = xmin + srcW / 2; y1 = ymin + srcH / 2;
      x2 = xmax + srcW / 2; y2 = ymax + srcH / 2;
    } else {
      [x1, y1, x2, y2] = values;
    }
    [x1, x2] = x1 <= x2 ? [x1, x2] : [x2, x1];
    [y1, y2] = y1 <= y2 ? [y1, y2] : [y2, y1];
    const wPx = x2 - x1;
    const hPx = y2 - y1;
    if (wPx <= 0 || hPx <= 0) return;
    const label = normalizeLabel(item.label);
    const box = {
      label,
      visible: true,
      lock_aspect: label !== "object",
      cx: ((x1 + x2) / 2) / srcW,
      cy: ((y1 + y2) / 2) / srcH,
      w: wPx / srcW,
      h: hPx / srcH,
      orig_aspect: wPx / Math.max(hPx, 1e-6),
      text: String(item.text ?? ""),
      caption: String(item.caption ?? ""),
      tags: splitTags(item.tags ?? []),
      palette: splitTags(item.palette ?? []),
    };
    box.id = contentId(label, box.caption, box.text, box);
    if (seen.has(box.id)) box.id = `${box.id}_${index}`;
    seen.add(box.id);
    if (srcW !== dstW || srcH !== dstH) {
      const moved = syncBoxAspectRatio(box, srcW, srcH, dstW, dstH, mode);
      box.cx = moved.cx; box.cy = moved.cy; box.w = moved.w; box.h = moved.h;
    }
    boxes.push(box);
  });

  // A caption cannot make an invalid nonempty layout an intentional empty one.
  if (data.items.length && !boxes.length) return null;
  return { kind: compiled ? "compiled" : "draft", width: srcW, height: srcH, caption, meta, palette, canvas, boxes };
}

export function buildDraftJson(state, W, H, summary) {
  const mode = summary.layerOrder || LAYER_AUTO;
  const boxes = effectiveOrder(state.boxes.filter((b) => b.visible !== false), mode);
  const items = [];
  for (const box of boxes) {
    const x1 = clamp(box.cx - box.w / 2, 0, 1) * W;
    const y1 = clamp(box.cy - box.h / 2, 0, 1) * H;
    const x2 = clamp(box.cx + box.w / 2, 0, 1) * W;
    const y2 = clamp(box.cy + box.h / 2, 0, 1) * H;
    if (x2 - x1 < MIN_BOX_PX || y2 - y1 < MIN_BOX_PX) continue;
    const item = {
      label: box.label,
      caption: box.caption || defaultCaption(box, W, H, summary.lang),
      bbox: [x1, y1, x2, y2].map((value) => Number(value.toFixed(9))),
    };
    if (box.label === "text") item.text = box.text;
    if (box.tags?.length) item.tags = box.tags.slice();
    if (box.palette?.length) item.palette = box.palette.slice();
    items.push(item);
  }
  const payload = {
    width: W,
    height: H,
    bbox_coord_space: "abs",
    bbox_format: "xyxy",
    summary: {},
    items,
  };
  if (summary.meta?.length) payload.summary.meta = summary.meta.slice();
  if (summary.canvas) payload.summary.canvas = summary.canvas;
  payload.summary.caption = summary.caption || "";
  if (summary.palette?.length) payload.summary.palette = summary.palette.slice();
  return payload;
}

export function defaultCaption(box, W, H, lang) {
  const zh = lang === "zh";
  const cy = num(box.cy, 0.5);
  const aspect = (box.w * W) / Math.max(box.h * H, 1e-6);
  if (zh) {
    const zone = cy <= 0.22 ? "画面上方的主标题" : cy <= 0.42 ? "上部副标题" :
      cy <= 0.62 ? "画面中心的主标题" : cy <= 0.8 ? "下部辅助文字" : "底部落款文字";
    const shape = aspect >= 6 ? "单行横向横幅" : aspect >= 3 ? "单行标签" : "紧凑多行文本块";
    if (box.label === "text" && box.text) {
      return `清晰可读的排版，渲染文字 "${box.text}"，位于${zone}，${shape}。`;
    }
    return box.label === "text" ? "清晰可读的排版。" : `一个轮廓清晰的 ${box.label} 区域。`;
  }
  const zone = cy <= 0.22 ? "headline at the top of the canvas" : cy <= 0.42 ? "upper sub-headline" :
    cy <= 0.62 ? "centered headline" : cy <= 0.8 ? "lower supporting text" : "footer text at the bottom";
  const shape = aspect >= 6 ? "single-line wide banner" : aspect >= 3 ? "one-line label" : "compact multi-line text block";
  if (box.label === "text" && box.text) {
    return `Clear, legible typography rendering the text "${box.text}" — ${zone}, ${shape}`;
  }
  return box.label === "text" ? "Clear, legible typography." : `A clearly defined ${box.label} region.`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const CSS = `
.vmmoss { display:flex; flex-direction:column; gap:4px; width:100%; height:100%;
  box-sizing:border-box; padding:0 2px 2px; font-size:11px; color:#d7d7e2;
  user-select:none; -webkit-user-select:none; }
.vmmoss-bar { display:flex; align-items:center; gap:4px; flex:0 0 auto; flex-wrap:wrap; }
.vmmoss-btn { font:inherit; font-size:10.5px; line-height:1; padding:5px 7px; border-radius:5px;
  border:1px solid #3a3a46; background:#242430; color:#d7d7e2; cursor:pointer; white-space:nowrap; }
.vmmoss-btn:hover { background:#2f2f3d; border-color:#4a4a5a; }
.vmmoss-btn.on { background:#2b4a7a; border-color:#4a90ff; color:#dce9ff; }
.vmmoss-btn.accent { border-color:#3d5b8c; }
.vmmoss-btn.danger:hover { background:#5a2530; border-color:#a3455a; }
.vmmoss-sep { width:1px; height:16px; background:#33333f; margin:0 2px; }
.vmmoss-host { display:flex; align-items:center; justify-content:center; flex:0 0 auto;
  background:#101014; border:1px solid #2e2e3a; border-radius:6px; overflow:hidden; position:relative; }
.vmmoss-canvas { display:block; touch-action:none; cursor:crosshair; outline:none; }
.vmmoss-ref { display:none; align-items:center; gap:6px; flex-wrap:wrap; font-size:10px;
  color:#9a9aab; background:#1b1b24; border:1px solid #2e2e3a; border-radius:5px; padding:3px 6px; }
.vmmoss-ref.show { display:flex; }
.vmmoss-ref input[type=range] { width:64px; accent-color:#4a90ff; }
.vmmoss-rows { flex:1 1 auto; overflow-y:auto; overflow-x:hidden; border:1px solid #2e2e3a;
  border-radius:6px; background:#191920; position:relative; min-height:0; }
.vmmoss-rows::-webkit-scrollbar { width:8px; }
.vmmoss-rows::-webkit-scrollbar-thumb { background:#3a3a48; border-radius:4px; }
.vmmoss-row { display:flex; align-items:center; gap:3px; height:${ROW_H}px; padding:0 4px;
  border-bottom:1px solid #23232c; cursor:default; }
.vmmoss-row:last-child { border-bottom:none; }
.vmmoss-row.sel { background:#22304a; }
.vmmoss-row.hidden-box { opacity:0.45; }
.vmmoss-row .grip { cursor:grab; color:#6f6f80; font-size:12px; padding:0 1px; }
.vmmoss-ico { font:inherit; font-size:10px; line-height:1; width:20px; height:18px; padding:0;
  border-radius:4px; border:1px solid transparent; background:transparent; color:#b9b9c8; cursor:pointer; }
.vmmoss-ico:hover { background:#2c2c39; border-color:#3c3c4a; }
.vmmoss-ico.off { opacity:0.4; }
.vmmoss-sel { font:inherit; font-size:10px; height:18px; padding:0 2px; border-radius:4px;
  border:1px solid #3a3a46; background:#22222c; color:#d7d7e2; cursor:pointer; flex:0 0 auto; }
.vmmoss-inp { font:inherit; font-size:10.5px; height:18px; padding:0 4px; border-radius:4px;
  border:1px solid #33333f; background:#131319; color:#e4e4ef; min-width:0; }
.vmmoss-inp:focus { outline:none; border-color:#4a90ff; background:#101018; }
.vmmoss-inp::placeholder { color:#5c5c6b; }
.vmmoss-tag { font-size:9.5px; font-weight:700; padding:1px 4px; border-radius:3px; flex:0 0 auto; color:#0d0d12; }
.vmmoss-foot { flex:0 0 auto; font-size:10px; color:#8b8b9c; display:flex; gap:8px; align-items:center;
  height:16px; overflow:hidden; white-space:nowrap; }
.vmmoss-foot .warn { color:#e0a34a; }
.vmmoss-pal { display:flex; align-items:center; gap:4px; flex:0 0 auto; height:24px; overflow-x:auto;
  overflow-y:hidden; white-space:nowrap; padding:0 1px; }
.vmmoss-pal::-webkit-scrollbar { height:5px; }
.vmmoss-pal::-webkit-scrollbar-thumb { background:#3a3a48; border-radius:3px; }
.vmmoss-pick { border-color:#3f6f8f; color:#bfe6ff; }
.vmmoss-pick:hover { background:#1d3a4d; border-color:#59a7cf; }
.vmmoss-extract { border-color:#6a5a2f; color:#f0dca8; }
.vmmoss-extract:hover { background:#3a3220; border-color:#a8894a; }
.vmmoss-pop .vmmoss-pop-pick { border-color:#3f6f8f; color:#bfe6ff; }
.vmmoss-pal-label { font-size:9.5px; color:#8b8b9c; flex:0 0 auto; }
.vmmoss-theme { font:inherit; font-size:9.5px; height:18px; padding:0 2px; border-radius:4px;
  border:1px solid #3a3a46; background:#22222c; color:#d7d7e2; cursor:pointer; flex:0 0 auto; max-width:118px; }
.vmmoss-swatch { display:inline-flex; align-items:center; gap:2px; height:18px; padding:0 2px 0 3px;
  border-radius:4px; background:#20202a; border:1px solid #33333f; flex:0 0 auto; }
.vmmoss-swatch i { width:9px; height:9px; border-radius:2px; display:block;
  border:1px solid rgba(255,255,255,0.28); box-shadow:0 0 0 1px rgba(0,0,0,0.35); }
.vmmoss-swatch b { font-size:8.5px; font-weight:500; color:#b9b9c8; font-family:ui-monospace, Consolas, monospace; }
.vmmoss-swatch button { font:inherit; font-size:9px; line-height:1; width:12px; height:12px; padding:0;
  border:none; border-radius:3px; background:transparent; color:#8b8b9c; cursor:pointer; }
.vmmoss-swatch button:hover { background:#4a2530; color:#ffb0be; }
.vmmoss-swatch .pick { width:9px; height:9px; padding:0; border:none; background:transparent; cursor:pointer; }
.vmmoss-pal-btn { display:inline-flex; align-items:center; gap:1.5px; height:18px; padding:0 3px;
  border-radius:4px; border:1px solid transparent; background:transparent; color:#b9b9c8;
  font:inherit; font-size:10px; line-height:1; cursor:pointer; flex:0 0 auto; }
.vmmoss-pal-btn:hover { background:#2c2c39; border-color:#3c3c4a; }
.vmmoss-pal-btn.has { background:#232330; border-color:#3a3a4a; }
.vmmoss-dot { width:7px; height:7px; border-radius:50%; display:block; border:1px solid rgba(0,0,0,0.55); }
.vmmoss-zoom { position:absolute; top:6px; right:6px; z-index:4; display:none; align-items:center;
  gap:3px; padding:2px 7px; border-radius:10px; background:rgba(12,12,18,0.78);
  border:1px solid rgba(120,170,255,0.55); color:#cfe2ff; font-size:9.5px; font-variant-numeric:tabular-nums;
  cursor:pointer; user-select:none; backdrop-filter:blur(2px); }
.vmmoss-zoom.show { display:inline-flex; }
.vmmoss-zoom:hover { background:rgba(30,60,110,0.85); }
.vmmoss-pop { position:fixed; z-index:10001; width:228px; box-sizing:border-box; padding:8px;
  background:#1b1b23; border:1px solid #3d3d4c; border-radius:8px; color:#d9d9e6; font-size:10.5px;
  box-shadow:0 12px 32px rgba(0,0,0,0.55); }
.vmmoss-pop h4 { margin:0 0 6px; font-size:10.5px; font-weight:600; display:flex;
  align-items:center; justify-content:space-between; gap:6px; }
.vmmoss-pop h4 span { font-weight:400; color:#7d7d90; font-size:9.5px; }
.vmmoss-pop .cur { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:6px; min-height:18px; }
.vmmoss-pop .grid { display:grid; grid-template-columns:repeat(8, 1fr); gap:3px; margin:4px 0 2px; }
.vmmoss-pop .grid button { width:100%; aspect-ratio:1 / 1; padding:0; border-radius:3px;
  border:1px solid rgba(255,255,255,0.2); cursor:pointer; }
.vmmoss-pop .grid button:hover { outline:1px solid #7fb0ff; outline-offset:1px; }
.vmmoss-pop .bar { display:flex; gap:4px; align-items:center; margin-top:6px; }
.vmmoss-pop .bar input[type=text] { flex:1 1 auto; min-width:0; font:inherit; font-size:10px; height:18px;
  padding:0 4px; border-radius:4px; border:1px solid #33333f; background:#131319; color:#e4e4ef; }
.vmmoss-pop .bar input[type=color] { width:22px; height:18px; padding:0; border:1px solid #3a3a46;
  border-radius:4px; background:#131319; cursor:pointer; }
.vmmoss-pop .hint { margin-top:4px; font-size:9.5px; color:#e0a34a; min-height:14px; }
.vmmoss-inspector { display:none; flex:0 0 auto; flex-direction:column; gap:4px; width:100%;
  box-sizing:border-box; padding:6px; border:1px solid #33415c; border-radius:6px; background:#1a1c24; }
.vmmoss-inspector.show { display:flex; }
.vmmoss-inspector .head { display:flex; align-items:center; gap:6px; font-size:10px; color:#a8b6cc; }
.vmmoss-inspector .head .spacer { margin-left:auto; }
.vmmoss-inspector .head .tag { font-size:9.5px; font-weight:700; padding:1px 4px; border-radius:3px;
  background:#2b3a55; color:#cfe0ff; }
.vmmoss-inspector .field { display:flex; flex-direction:column; gap:2px; }
.vmmoss-inspector label { font-size:9.5px; color:#8b8b9c; }
.vmmoss-inspector textarea { width:100%; box-sizing:border-box; font:inherit; font-size:12px;
  line-height:1.45; min-height:42px; resize:vertical; padding:4px 6px; border-radius:5px;
  border:1px solid #33333f; background:#131319; color:#e4e4ef; }
.vmmoss-inspector textarea.vmmoss-insp-single { min-height:46px; }
.vmmoss-inspector textarea:focus { outline:none; border-color:#4a90ff; background:#101018; }
.vmmoss-ico.on { background:#2b4a7a; border-color:#4a90ff; }
.vmmoss-pop .sub { font-size:9.5px; color:#8b8b9c; margin:6px 0 2px; }
.vmmoss-empty { padding:9px 8px; color:#6f6f80; font-size:10.5px; line-height:1.5; }
.vmmoss-insert { position:absolute; left:0; right:0; height:2px; background:#4a90ff; pointer-events:none; display:none; z-index:3; }
.vmmoss-modal { position:fixed; inset:0; background:rgba(6,8,12,0.62); display:flex; align-items:center;
  justify-content:center; z-index:10000; }
.vmmoss-card { width:min(680px, 92vw); max-height:86vh; display:flex; flex-direction:column; gap:8px;
  background:#1b1b23; border:1px solid #3a3a48; border-radius:10px; padding:14px 16px; color:#d9d9e6;
  box-shadow:0 18px 48px rgba(0,0,0,0.55); font-size:12px; }
.vmmoss-card h3 { margin:0; font-size:13.5px; font-weight:600; }
.vmmoss-card p { margin:0; color:#9a9aab; font-size:11px; line-height:1.5; }
.vmmoss-card textarea { width:100%; min-height:280px; resize:vertical; font-family:ui-monospace, Consolas, monospace;
  font-size:11px; line-height:1.45; background:#121218; color:#e6e6f2; border:1px solid #33333f;
  border-radius:6px; padding:8px; box-sizing:border-box; }
.vmmoss-card textarea:focus { outline:none; border-color:#4a90ff; }
.vmmoss-card .row { display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap; }
.vmmoss-card .row .left { margin-right:auto; }
.vmmoss-status { font-size:11px; color:#9a9aab; min-height:16px; }
.vmmoss-status.err { color:#ef7f8f; }
.vmmoss-status.ok { color:#6fce93; }
`;

function injectStyle() {
  if (document.getElementById("vmmoss-style")) return;
  const style = document.createElement("style");
  style.id = "vmmoss-style";
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Node setup
// ---------------------------------------------------------------------------
function widgetsOf(node) {
  const find = (name) => node.widgets?.find((w) => w.name === name);
  return {
    find,
    language: find("ui_language"),
    preset: find("canvas_preset"),
    width: find("width"),
    height: find("height"),
    sync: find("bbox_ratio_sync"),
    meta: find("scene_meta"),
    canvas: find("canvas_layout_type"),
    order: find("layer_order_mode"),
    caption: find("global_prompt"),
    data: find("layout_data"),
    externalMode: find("external_sync_mode"),
    customTags: find("custom_meta_tags"),
  };
}

function hideWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  if (!widget.options) widget.options = {};
  widget.options.hidden = true;
  if (!window.LiteGraph?.vueNodesMode) {
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
  }
  if (widget.element) widget.element.style.display = "none";
}

function dropUnlinkedInput(node, name) {
  const index = node.inputs?.findIndex((input) => input.name === name && input.link == null) ?? -1;
  if (index >= 0) {
    try { node.removeInput(index); } catch (err) { /* older frontends */ }
  }
}

function setup(node) {
  const W = widgetsOf(node);
  if (!W.data || !W.preset || !W.width || !W.height) return;

  injectStyle();
  hideWidget(W.data);
  dropUnlinkedInput(node, "layout_data");

  // Declared before S: the S initializer reads it through loadGuides().
  const GUIDE_PROP = "vmmoss_guides";

  const S = {
    state: normalizeState(W.data.value, num(W.width.value, 896), num(W.height.value, 1152)),
    sel: null,
    hover: null,
    snap: true,
    suppress: 0,
    drag: null,
    dpr: Math.max(1, Math.min(3, window.devicePixelRatio || 1)),
    canvasW: 0,
    canvasH: 0,
    ref: null,       // {size:[w,h], aligned:[w,h], thumb, opacity}
    modal: null,
    view: { zoom: 1, panX: 0, panY: 0 },   // V2.1 in-canvas zoom / pan
    pan: null,
    space: false,
    inside: false,
    pop: null,       // per-box colour popover
    eye: null,       // V2.2 canvas eyedropper: { target, boxId, hex, mx, my, moved }
    guides: loadGuides(),   // V2.3 {thirds, golden} — visual only, persisted on node.properties
    inspector: null,        // V2.3 expanded box id (text inspector drawer)
  };

  /** Guides live on node.properties so they survive save / reload and never touch layout_data. */
  function loadGuides() {
    const raw = node.properties?.[GUIDE_PROP];
    return { thirds: raw?.thirds == null ? true : !!raw.thirds, golden: !!raw?.golden };
  }

  function saveGuides() {
    node.properties ||= {};
    node.properties[GUIDE_PROP] = { thirds: !!S.guides.thirds, golden: !!S.guides.golden };
    app.graph?.setDirtyCanvas?.(true, true);
  }

  function syncGuideButtons() {
    btnThirds.textContent = `📐 ${t("thirds")}`;
    btnGolden.textContent = `🔱 ${t("golden")}`;
    btnThirds.title = `${t("thirdsTip")} · ${t("guidesSnapTip")}`;
    btnGolden.title = `${t("goldenTip")} · ${t("guidesSnapTip")}`;
    btnThirds.classList.toggle("on", !!S.guides.thirds);
    btnGolden.classList.toggle("on", !!S.guides.golden);
    btnThirds.setAttribute("aria-pressed", S.guides.thirds ? "true" : "false");
    btnGolden.setAttribute("aria-pressed", S.guides.golden ? "true" : "false");
  }

  function toggleGuide(kind) {
    if (kind !== "thirds" && kind !== "golden") return;
    S.guides[kind] = !S.guides[kind];
    saveGuides();
    syncGuideButtons();
    draw();
  }

  const lang = () => (String(W.language?.value || "").startsWith("English") ? "en" : "zh");
  const t = (key, vars) => translate(lang(), key, vars);

  // --- DOM ---------------------------------------------------------
  const root = document.createElement("div");
  const autocomplete = createPromptAutocomplete(loadAutocomplete);
  root.className = "vmmoss";

  const bar = document.createElement("div");
  bar.className = "vmmoss-bar";
  const mkBtn = (text, title, cls = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `vmmoss-btn ${cls}`.trim();
    b.textContent = text;
    b.title = title;
    return b;
  };
  const btnText = mkBtn("", "", "accent");
  const btnChar = mkBtn("", "", "accent");
  const btnObj = mkBtn("", "", "accent");
  const sep1 = document.createElement("div"); sep1.className = "vmmoss-sep";
  const btnImport = mkBtn("", "");
  const btnExport = mkBtn("", "");
  const sep2 = document.createElement("div"); sep2.className = "vmmoss-sep";
  const btnSnap = mkBtn("", "", "on");
  const btnThirds = mkBtn("", "", "");
  const btnGolden = mkBtn("", "", "");
  btnThirds.className += " vmmoss-guide-thirds";
  btnGolden.className += " vmmoss-guide-golden";
  const sepGuide = document.createElement("div"); sepGuide.className = "vmmoss-sep";
  const sep3 = document.createElement("div"); sep3.className = "vmmoss-sep";
  const btnCenterH = mkBtn("", "");
  const btnCenterV = mkBtn("", "");
  const btnMatchW = mkBtn("", "");
  const btnMatchH = mkBtn("", "");
  const btnDistH = mkBtn("", "");
  const btnDistV = mkBtn("", "");
  const btnClear = mkBtn("", "", "danger");
  const btnToggleAll = mkBtn("", "");
  const btnLang = mkBtn("", "", "");
  btnLang.style.marginLeft = "auto";
  bar.append(btnText, btnChar, btnObj, sep1, btnImport, btnExport, sep2, btnSnap,
    btnThirds, btnGolden, sepGuide, sep3,
    btnCenterH, btnCenterV, btnMatchW, btnMatchH, btnDistH, btnDistV, btnToggleAll, btnClear, btnLang);
  btnLang.addEventListener("click", () => {
    setWidgetValue(W.language, lang() === "zh" ? "English (EN)" : "中文 (ZH)");
    applyLanguage(); rebuildRows(); draw(); updateFoot(); renderRefBar();
  });
  btnThirds.addEventListener("click", (event) => { event.stopPropagation(); toggleGuide("thirds"); });
  btnGolden.addEventListener("click", (event) => { event.stopPropagation(); toggleGuide("golden"); });
  for (const button of [btnThirds, btnGolden]) {
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
  }

  const pixelBar = document.createElement("div");
  pixelBar.className = "vmmoss-pixels";
  pixelBar.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:0 0 auto;font-size:11px;";
  const pixelLabel = document.createElement("label");
  const pixelLabelText = document.createElement("span");
  const pixelInput = document.createElement("input");
  pixelInput.className = "vmmoss-mp-input";
  pixelInput.type = "number"; pixelInput.min = "0.01"; pixelInput.max = "32"; pixelInput.step = "0.01";
  pixelInput.style.cssText = "width:62px;margin-left:6px;background:#252530;color:#eee;border:1px solid #555;border-radius:4px;";
  function restorePixelTarget() {
    const value = node.properties?.vmmoss_target_megapixels;
    pixelInput.value = String(typeof value === "number" && Number.isFinite(value) && value >= 0.01 && value <= 32 ? value : 2);
  }
  restorePixelTarget();
  pixelLabel.append(pixelLabelText, pixelInput);
  const pixelApply = mkBtn("", "");
  pixelApply.className += " vmmoss-mp-apply";
  const pixelActual = document.createElement("span");
  pixelActual.className = "vmmoss-mp-actual";
  pixelActual.style.color = "#aaa";
  const pixelError = document.createElement("span");
  pixelError.className = "vmmoss-mp-error";
  pixelError.style.cssText = "color:#ffad70;flex-basis:100%;display:none;";
  pixelBar.append(pixelLabel, pixelApply, pixelActual, pixelError);
  const sizeLinked = () => ["width", "height"].some(name => node.inputs?.some(i => i.name === name && i.link != null));
  function renderPixelControls() {
    const { w, h } = liveSize();
    const linked = sizeLinked();
    pixelLabelText.textContent = t("megapixels");
    pixelApply.textContent = t("applyPixels");
    pixelInput.disabled = pixelApply.disabled = linked;
    pixelInput.title = pixelApply.title = linked ? t("linked") : t("pixelsTip");
    pixelActual.textContent = t("pixelsActual", { w, h, mp: (w * h / 1_000_000).toFixed(3) });
    if (pixelError.style.display !== "none") pixelError.textContent = t("pixelsInvalid");
  }
  pixelApply.addEventListener("click", () => {
    if (sizeLinked()) return;
    const { w, h } = liveSize();
    const mp = Number(pixelInput.value);
    const size = sizeForMegapixels(w, h, mp);
    pixelError.style.display = size ? "none" : "block";
    if (!size) { renderPixelControls(); applyLayout(true); return; }
    node.properties ||= {};
    node.properties.vmmoss_target_megapixels = mp;
    setWidgetValue(W.preset, PRESET_CUSTOM);
    setWidgetValue(W.width, size.w);
    setWidgetValue(W.height, size.h);
    onSizeChanged();
    // Also redraw when the requested size already matches the canvas.
    renderPixelControls();
  });
  pixelInput.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); pixelApply.click(); }
  });

  const host = document.createElement("div");
  host.className = "vmmoss-host";
  const canvas = document.createElement("canvas");
  canvas.className = "vmmoss-canvas";
  canvas.tabIndex = 0;
  const zoomBadge = document.createElement("div");
  zoomBadge.className = "vmmoss-zoom";
  host.append(canvas, zoomBadge);

  // --- global palette bar (V2.1) -----------------------------------
  const palBar = document.createElement("div");
  palBar.className = "vmmoss-pal";
  const palLabel = document.createElement("span");
  palLabel.className = "vmmoss-pal-label";
  const palTheme = document.createElement("select");
  palTheme.className = "vmmoss-theme";
  const palSwatches = document.createElement("span");
  palSwatches.style.cssText = "display:inline-flex;gap:3px;align-items:center;flex:0 0 auto;";
  const palAdd = document.createElement("button");
  palAdd.type = "button";
  palAdd.className = "vmmoss-btn";
  palAdd.style.cssText = "padding:2px 5px;font-size:9.5px;";
  const palPicker = document.createElement("input");
  palPicker.type = "color";
  palPicker.className = "vmmoss-pal-input";
  palPicker.style.display = "none";
  palPicker.value = "#38BDF8";
  // V2.2: full-screen eyedropper + reference palette extraction.
  const palPick = document.createElement("button");
  palPick.type = "button";
  palPick.className = "vmmoss-btn vmmoss-pick";
  palPick.style.cssText = "padding:2px 5px;font-size:9.5px;";
  const palExtract = document.createElement("button");
  palExtract.type = "button";
  palExtract.className = "vmmoss-btn vmmoss-extract";
  palExtract.style.cssText = "padding:2px 5px;font-size:9.5px;";
  const palHint = document.createElement("span");
  palHint.className = "vmmoss-pal-hint";
  palHint.style.cssText = "font-size:9.5px;color:#8b8b9c;flex:0 0 auto;";
  palBar.append(palLabel, palTheme, palSwatches, palAdd, palPicker, palPick, palExtract, palHint);

  const refBar = document.createElement("div");
  refBar.className = "vmmoss-ref";
  const refLabel = document.createElement("span");
  const refMatch = document.createElement("button");
  refMatch.type = "button";
  refMatch.className = "vmmoss-btn";
  const refOpacity = document.createElement("input");
  refOpacity.type = "range";
  refOpacity.min = "0";
  refOpacity.max = "100";
  refOpacity.value = "45";
  const refOpacityLabel = document.createElement("span");
  const refExtract = document.createElement("button");
  refExtract.type = "button";
  refExtract.className = "vmmoss-btn vmmoss-extract";
  refExtract.style.cssText = "padding:2px 5px;font-size:9.5px;";
  refBar.append(refLabel, refMatch, refExtract, refOpacityLabel, refOpacity);

  const rows = document.createElement("div");
  rows.className = "vmmoss-rows";
  const insert = document.createElement("div");
  insert.className = "vmmoss-insert";
  rows.appendChild(insert);

  // V2.3 expandable text inspector: one drawer shared by the selected box.
  const inspector = document.createElement("div");
  inspector.className = "vmmoss-inspector";

  const foot = document.createElement("div");
  foot.className = "vmmoss-foot";

  root.append(bar, pixelBar, palBar, host, refBar, rows, inspector, foot);
  const ctx = canvas.getContext("2d");
  let observer = null;
  const captionElement = W.caption?.inputEl || W.caption?.element;
  const CAPTION_HEIGHT_PROP = "vmmoss_caption_height";
  let captionHeight = 84;
  let captionObserver = null;
  let captionResizing = false;
  const INSPECTOR_HEIGHTS_PROP = "vmmoss_inspector_heights";
  let inspectorObserver = null;
  let inspectorResizeTarget = null;

  function syncInspectorHeight() {
    if (!inspectorResizeTarget || !inspector.contains(inspectorResizeTarget)) return;
    const height = inspectorResizeTarget.offsetHeight;
    if (!height) return;
    node.properties ||= {};
    node.properties[INSPECTOR_HEIGHTS_PROP] = {
      ...node.properties[INSPECTOR_HEIGHTS_PROP],
      [inspectorResizeTarget.dataset.field]: height,
    };
    applyLayout(true);
    app.graph?.setDirtyCanvas?.(true, true);
  }
  const endInspectorResize = () => { syncInspectorHeight(); inspectorResizeTarget = null; };
  window.addEventListener("pointerup", endInspectorResize, { capture: true });
  window.addEventListener("pointercancel", endInspectorResize, { capture: true });

  // Keep the native STRING widget (and its serialization), but give its DOM
  // textarea an explicit, resizable allocation in ComfyUI's widget layout.
  function restoreCaptionHeight() {
    captionHeight = Math.max(64, num(node.properties?.[CAPTION_HEIGHT_PROP], 84));
    if (!captionElement || !W.caption) return;
    Object.assign(captionElement.style, {
      resize: "vertical", minHeight: "64px", height: `${captionHeight}px`,
      boxSizing: "border-box", overflow: "auto",
    });
    W.caption.options ||= {};
    // ComfyUI allocates the DOM wrapper inside the widget's top/bottom margin.
    // Reserve that space too, otherwise the textarea covers the next widget.
    const allocatedHeight = () => captionHeight + 2 * Math.max(0, num(W.caption.margin, 10));
    W.caption.options.getMinHeight = allocatedHeight;
    W.caption.options.getMaxHeight = allocatedHeight;
    W.caption.options.getHeight = allocatedHeight;
  }

  function syncCaptionHeight() {
    if (!captionResizing || !captionElement) return;
    // offsetHeight is in local CSS pixels, independent of the outer graph zoom.
    const height = Math.max(64, captionElement.offsetHeight || captionHeight);
    if (Math.abs(height - captionHeight) < 1) return;
    captionHeight = height;
    node.properties ||= {};
    node.properties[CAPTION_HEIGHT_PROP] = height;
    applyLayout(true);
    app.graph?.setDirtyCanvas?.(true, true);
  }

  const beginCaptionResize = (event) => {
    if (event.button !== 0 || !captionElement) return;
    const rect = captionElement.getBoundingClientRect();
    captionResizing = event.clientX >= rect.right - 16 && event.clientY >= rect.bottom - 16;
    if (captionResizing) event.stopPropagation();
  };
  const endCaptionResize = () => { syncCaptionHeight(); captionResizing = false; };
  captionElement?.addEventListener("pointerdown", beginCaptionResize);
  window.addEventListener("pointerup", endCaptionResize, { capture: true });
  window.addEventListener("pointercancel", endCaptionResize, { capture: true });

  // --- sizes -------------------------------------------------------
  function liveSize() {
    const preset = PRESETS[W.preset.value];
    if (preset) return { w: preset[0], h: preset[1] };
    return {
      w: alignedSize(W.width.value, 896),
      h: alignedSize(W.height.value, 1152),
    };
  }

  const syncMode = () => syncModeValue(W.sync?.value);
  const orderMode = () => (W.order?.value === LAYER_MANUAL ? LAYER_MANUAL : LAYER_AUTO);

  function commit() {
    W.data.value = JSON.stringify(S.state);
    app.graph?.setDirtyCanvas?.(true, true);
  }
  if (W.data) W.data.serializeValue = () => JSON.stringify(S.state);

  // --- layout ------------------------------------------------------
  function canvasHeight(w, h) {
    const width = Math.max(240, (node.size?.[0] || 520) - 26);
    return clamp(Math.round((width * h) / Math.max(w, 1)), CANVAS_MIN_H, CANVAS_MAX_H);
  }

  function rowsHeightFor(count) {
    return clamp(6 + Math.max(count, 0) * ROW_H, count === 0 ? 38 : 32, LIST_MAX_H);
  }

  function rowsBoxH() {
    const h = parseInt(rows.style.height, 10);
    return Number.isFinite(h) && h > 0 ? h : rowsHeightFor(S.state.boxes.length);
  }

  function desiredHeight() {
    const { w, h } = liveSize();
    const barH = bar.offsetHeight || 52;
    const palH = palBar.offsetHeight || 24;
    const footH = foot.offsetHeight || 16;
    const refH = refBar.classList.contains("show") ? refBar.offsetHeight || 24 : 0;
    const inspH = inspector.classList.contains("show") ? (inspector.offsetHeight || 96) + 4 : 0;
    return barH + (pixelBar.offsetHeight || 24) + 4 + palH + 4 + canvasHeight(w, h) + 8
      + rowsBoxH() + (refH ? refH + 4 : 0) + inspH + 6 + footH + 2;
  }

  function applyLayout(resizeNode) {
    const { w, h } = liveSize();
    host.style.height = `${canvasHeight(w, h)}px`;
    fitCanvas();
    if (resizeNode !== false) {
      const total = node.computeSize()[1];
      const current = node.size?.[1] || 0;
      if (Math.abs(current - total) > 3) node.setSize([node.size[0], total]);
    }
  }

  function fitCanvas() {
    const { w, h } = liveSize();
    const availW = Math.max(1, host.clientWidth - 2);
    const availH = Math.max(1, host.clientHeight - 2);
    const scale = Math.min(availW / w, availH / h);
    const prevW = S.canvasW;
    const prevH = S.canvasH;
    S.canvasW = Math.max(1, Math.floor(w * scale));
    S.canvasH = Math.max(1, Math.floor(h * scale));
    canvas.style.width = `${S.canvasW}px`;
    canvas.style.height = `${S.canvasH}px`;
    canvas.width = Math.round(S.canvasW * S.dpr);
    canvas.height = Math.round(S.canvasH * S.dpr);
    if (S.canvasW !== prevW || S.canvasH !== prevH) {
      // Keep the zoom level but fold the new viewport back into its bounds.
      S.view = clampView(S.view.zoom, S.view.panX, S.view.panY, S.canvasW, S.canvasH);
      renderZoomBadge();
    }
    draw();
  }

  function renderZoomBadge() {
    const zoom = S.view.zoom;
    const show = zoom > 1.001;
    zoomBadge.classList.toggle("show", show);
    zoomBadge.title = t("zoomResetTip");
    if (!show) return;
    zoomBadge.textContent = t("zoomBadge", { p: Math.round(zoom * 100) });
  }

  function resetView() {
    S.view = { zoom: 1, panX: 0, panY: 0 };
    renderZoomBadge();
    draw();
  }

  /** Wheel → zoom around the cursor (mx,my in unscaled canvas CSS px). */
  function applyWheelZoom(event) {
    const rect = canvas.getBoundingClientRect();
    const mx = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * S.canvasW;
    const my = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * S.canvasH;
    const delta = event.deltaMode === 1 ? event.deltaY * 16
      : event.deltaMode === 2 ? event.deltaY * Math.max(S.canvasH, 1)
        : event.deltaY;
    const factor = Math.exp(-clamp(delta, -400, 400) * 0.0018);
    S.view = zoomAtPoint(S.view, mx, my, factor, S.canvasW, S.canvasH);
    renderZoomBadge();
    draw();
  }

  // --- drawing -----------------------------------------------------
  function cornersOf(box) {
    const x1 = (box.cx - box.w / 2) * S.canvasW;
    const x2 = (box.cx + box.w / 2) * S.canvasW;
    const y1 = (box.cy - box.h / 2) * S.canvasH;
    const y2 = (box.cy + box.h / 2) * S.canvasH;
    return [[x1, y1], [x2, y1], [x1, y2], [x2, y2]];
  }

  function draw(includeLoupe = true) {
    const cw = S.canvasW;
    const ch = S.canvasH;
    if (!cw || !ch) return;
    const { w: W, h: H } = liveSize();
    const view = S.view;
    const zoom = Math.max(view.zoom, 1e-6);
    const inv = 1 / zoom;             // chrome (lines, handles, labels) stays 1:1 on screen
    const f = (value) => value * inv;

    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    ctx.fillStyle = "#15151b";
    ctx.fillRect(0, 0, cw, ch);

    // Everything below lives in canvas space; the view transform handles zoom/pan.
    ctx.save();
    ctx.setTransform(S.dpr * zoom, 0, 0, S.dpr * zoom, S.dpr * view.panX, S.dpr * view.panY);

    const step = Math.max(24, Math.round(cw / 14));
    ctx.fillStyle = "#191921";
    for (let y = 0; y < ch; y += step) {
      for (let x = 0; x < cw; x += step) {
        if ((((x / step) | 0) + ((y / step) | 0)) % 2 === 0) ctx.fillRect(x, y, step, step);
      }
    }

    if (S.ref?.image?.complete && S.ref.image.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = clamp(num(refOpacity.value, 45) / 100, 0, 1);
      ctx.drawImage(S.ref.image, ...referenceRect(S.state, cw, ch, syncMode()));
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = inv;
    ctx.setLineDash([f(5), f(5)]);
    ctx.strokeRect(cw * 0.05, ch * 0.05, cw * 0.9, ch * 0.9);
    ctx.restore();

    const tags = displayTags(S.state.boxes);
    const ordered = effectiveOrder(S.state.boxes, orderMode());
    ordered.forEach((box, z) => {
      if (!box.visible) return;
      const style = LABEL_STYLE[box.label] || LABEL_STYLE.object;
      const tag = tags[box.id] || "";
      const x = (box.cx - box.w / 2) * cw;
      const y = (box.cy - box.h / 2) * ch;
      const bw = box.w * cw;
      const bh = box.h * ch;
      const selected = S.sel === box.id;

      ctx.fillStyle = style.fill;
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = f(selected ? 2.5 : S.hover === box.id ? 2 : 1.5);
      ctx.setLineDash(selected ? [] : [f(4), f(3)]);
      ctx.strokeRect(x, y, bw, bh);
      ctx.setLineDash([]);

      ctx.font = `600 ${f(10)}px ui-sans-serif, system-ui, 'Microsoft YaHei', sans-serif`;
      const chip = `[${tag}]`;
      const chipW = ctx.measureText(chip).width + f(8);
      const chipH = f(15);
      ctx.fillStyle = style.color;
      ctx.fillRect(x, y, Math.min(chipW, Math.max(bw, f(18))), chipH);
      ctx.fillStyle = "#0c0c11";
      ctx.fillText(chip, x + f(4), y + f(11));

      // Palette dots ride next to the tag chip (design §4.3).
      if (box.palette?.length) {
        const radius = f(3);
        const gap = f(2);
        let dotX = x + Math.min(chipW, Math.max(bw, f(18))) + f(3);
        const dotY = y + f(7.5);
        for (const color of box.palette.slice(0, 4)) {
          const hex = normalizeHex(color);
          dotX += radius;
          if (hex) {
            ctx.beginPath();
            ctx.arc(dotX, dotY, radius, 0, Math.PI * 2);
            ctx.fillStyle = hex;
            ctx.fill();
            ctx.lineWidth = inv;
            ctx.strokeStyle = "rgba(0,0,0,0.7)";
            ctx.stroke();
          }
          dotX += radius + gap;
        }
      }

      const rawBody = box.label === "text" ? box.text || box.caption : box.caption;
      const body = box.label === "text" && box.text ? `"${box.text}"` : rawBody;
      if (body && bw > f(44) && bh > f(18)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + f(2), y + chipH, Math.max(f(1), bw - f(4)), Math.max(f(1), bh - chipH - f(5)));
        ctx.clip();
        ctx.fillStyle = "rgba(240,240,248,0.92)";
        ctx.font = `${f(10.5)}px ui-sans-serif, system-ui, 'Microsoft YaHei', sans-serif`;
        let line = "";
        let ty = y + chipH + f(11);
        for (const chOne of String(body)) {
          const test = line + chOne;
          if (ctx.measureText(test).width > bw - f(8) && line) {
            ctx.fillText(line, x + f(4), ty);
            ty += f(12);
            line = chOne;
            if (ty > y + bh - f(3)) break;
          } else {
            line = test;
          }
        }
        if (line && ty <= y + bh - f(3)) ctx.fillText(line, x + f(4), ty);
        ctx.restore();
      }
      if (box.lock_aspect) {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = `${f(9)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText("LOCK", x + bw - f(24), y + bh - f(4));
      }
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `${f(9)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(`z${z + 1}`, x + f(2), y - f(3));

      if (selected) {
        const half = f(3.5);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = inv;
        for (const [hx, hy] of cornersOf(box)) {
          ctx.beginPath(); ctx.rect(hx - half, hy - half, f(7), f(7)); ctx.fill(); ctx.stroke();
        }
      }
    });

    // V2.3: guides are drawn *after* every box so they can never be covered.
    drawCompositionGuides(f);

    ctx.restore();

    if (includeLoupe) drawEyedropperLoupe();
  }

  /**
   * V2.3 composition guides (top layer): a dark halo plus a white dashed line so
   * the guides stay readable over white references and dark boxes alike.
   */
  function drawCompositionGuides(f) {
    const ratios = guideRatios(S.guides);
    if (!ratios.length) return;
    const cw = S.canvasW;
    const ch = S.canvasH;
    ctx.save();
    for (const { ratio, kind } of ratios) {
      const golden = kind === "golden";
      const x = cw * ratio;
      const y = ch * ratio;
      ctx.setLineDash(golden ? [f(3), f(3)] : [f(6), f(4)]);
      // 1) dark anti-collision halo
      ctx.lineWidth = f(3);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.38)";
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
      // 2) high-contrast dashed line
      ctx.lineWidth = f(1.25);
      ctx.strokeStyle = golden ? "rgba(255, 248, 220, 0.82)" : "rgba(255, 255, 255, 0.72)";
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (S.guides.golden) {
      // 3) four power points (crosshairs) at the golden intersections
      const arm = f(3.5);
      for (const rx of GUIDE_GOLDEN) {
        for (const ry of GUIDE_GOLDEN) {
          const px = cw * rx;
          const py = ch * ry;
          ctx.lineWidth = f(3);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.38)";
          ctx.beginPath();
          ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py);
          ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm);
          ctx.stroke();
          ctx.lineWidth = f(1.2);
          ctx.strokeStyle = "rgba(255, 248, 220, 0.92)";
          ctx.beginPath();
          ctx.moveTo(px - arm, py); ctx.lineTo(px + arm, py);
          ctx.moveTo(px, py - arm); ctx.lineTo(px, py + arm);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function roundRectPath(context, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }

  /**
   * V2.2 canvas loupe: crosshair + circular preview ring + `#RRGGBB` capsule.
   * Drawn in screen space (after the view transform is restored) so the ring
   * keeps a constant size at any zoom level.
   */
  function drawEyedropperLoupe() {
    const eye = S.eye;
    if (!eye) return;
    const x = num(eye.mx, -1);
    const y = num(eye.my, -1);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);

    if (x >= 0 && y >= 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.canvasH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.canvasW, y); ctx.stroke();
      ctx.restore();
    }
    if (x < 0 || y < 0 || !eye.hex) return;

    const radius = 20;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,8,14,0.5)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = eye.hex;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fill();

    const label = eye.hex;
    ctx.font = "600 11px ui-monospace, Consolas, monospace";
    const textWidth = ctx.measureText(label).width || 58;
    const capW = textWidth + 14;
    const capH = 19;
    let capX = x + radius + 10;
    let capY = y - capH - 9;
    if (capX + capW > S.canvasW - 4) capX = Math.max(4, x - radius - 10 - capW);
    if (capY < 4) capY = y + radius + 9;
    roundRectPath(ctx, capX, capY, capW, capH, 9);
    ctx.fillStyle = "rgba(12,12,18,0.88)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(140,180,255,0.62)";
    ctx.stroke();
    ctx.fillStyle = "#dce9ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, capX + capW / 2, capY + capH / 2 + 0.5);
    ctx.restore();
  }

  // --- layer list --------------------------------------------------
  /** Row lookup by box id — safer than interpolating ids into a selector. */
  function rowFor(id) {
    return [...rows.querySelectorAll(".vmmoss-row")].find((row) => row.dataset.id === id) || null;
  }

  function refreshSelection() {
    for (const row of rows.querySelectorAll(".vmmoss-row")) {
      row.classList.toggle("sel", row.dataset.id === S.sel);
    }
    // V2.3: an open drawer follows the newly selected box (deferred so the
    // pointer gesture is never interrupted by a node resize).
    if (S.inspector && S.sel && S.inspector !== S.sel
        && S.state.boxes.some((box) => box.id === S.sel)) {
      S.inspector = S.sel;
      requestAnimationFrame(() => renderInspector(true));
    }
  }

  function rebuildRows() {
    const scrollTop = rows.scrollTop;
    autocomplete.clear(rows);
    [...rows.querySelectorAll(".vmmoss-row, .vmmoss-empty")].forEach((row) => row.remove());
    const boxes = S.state.boxes;
    boxes.forEach((box) => {
      const style = LABEL_STYLE[box.label];
      const row = document.createElement("div");
      row.className = "vmmoss-row" + (S.sel === box.id ? " sel" : "") + (box.visible ? "" : " hidden-box");
      row.dataset.id = box.id;

      const grip = document.createElement("span");
      grip.className = "grip";
      grip.textContent = "☰";
      grip.title = t("gripTip");

      const vis = document.createElement("button");
      vis.type = "button";
      vis.className = "vmmoss-ico" + (box.visible ? "" : " off");
      vis.textContent = box.visible ? "👁" : "🚫";
      vis.title = t("visTip");
      vis.addEventListener("click", (event) => {
        event.stopPropagation();
        box.visible = !box.visible;
        commit(); rebuildRows(); draw(); updateFoot();
      });

      const lock = document.createElement("button");
      lock.type = "button";
      lock.className = "vmmoss-ico" + (box.lock_aspect ? "" : " off");
      lock.textContent = box.lock_aspect ? "🔒" : "🔓";
      lock.title = t("lockTip");
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        box.lock_aspect = !box.lock_aspect;
        if (box.lock_aspect) {
          const { w, h } = liveSize();
          box.orig_aspect = (box.w * w) / Math.max(box.h * h, 1e-6);
        }
        commit(); rebuildRows(); draw();
      });

      const tag = document.createElement("span");
      tag.className = "vmmoss-tag";
      tag.style.background = style.color;
      tag.textContent = style.tag;

      const select = document.createElement("select");
      select.className = "vmmoss-sel";
      select.title = t("typeTip");
      [["text", t("labelText")], ["character", t("labelChar")], ["object", t("labelObj")]].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        if (value === box.label) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        box.label = normalizeLabel(select.value);
        commit(); rebuildRows(); draw(); updateFoot();
      });

      const palBtn = document.createElement("button");
      palBtn.type = "button";
      palBtn.className = "vmmoss-pal-btn" + (box.palette?.length ? " has" : "");
      palBtn.dataset.palette = box.id;
      palBtn.title = box.palette?.length ? t("paletteDotsTip", { n: box.palette.length }) : t("paletteLayerTip");
      if (box.palette?.length) {
        for (const color of box.palette.slice(0, 4)) {
          const dot = document.createElement("span");
          dot.className = "vmmoss-dot";
          const hex = normalizeHex(color);
          dot.style.background = hex || "transparent";
          if (!hex) dot.style.borderStyle = "dashed";
          dot.title = color;
          palBtn.appendChild(dot);
        }
      } else {
        palBtn.textContent = "🎨";
      }
      palBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
      palBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openPalettePop(box, palBtn);
      });

      row.append(grip, vis, lock, tag, select, palBtn);

      if (box.label === "text") {
        const textArea = document.createElement("textarea");
        textArea.className = "vmmoss-inp";
        textArea.rows = 1;
        textArea.style.flex = "1 1 34%";
        textArea.style.resize = "none";
        textArea.style.overflow = "hidden";
        textArea.placeholder = t("placeholderText");
        textArea.title = t("rowTextTip");
        textArea.value = box.text;
        textArea.addEventListener("input", () => { box.text = textArea.value; commit(); draw(); updateFoot(); });
        textArea.addEventListener("pointerdown", (event) => event.stopPropagation());
        row.appendChild(textArea);
      }

      const caption = document.createElement("input");
      caption.className = "vmmoss-inp";
      caption.style.flex = "1 1 46%";
      caption.placeholder = box.label === "text" ? t("placeholderStyle") : t("placeholderCaption");
      caption.title = box.label === "text" ? t("rowStyleTip") : t("rowCaptionTip");
      caption.value = box.caption;
      caption.addEventListener("input", () => { box.caption = caption.value; commit(); draw(); });
      caption.addEventListener("pointerdown", (event) => event.stopPropagation());
      autocomplete.bind(caption);
      row.appendChild(caption);

      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = "vmmoss-ico vmmoss-expand" + (S.inspector === box.id ? " on" : "");
      expand.textContent = "⤢";
      expand.title = t("inspectorTip");
      expand.addEventListener("pointerdown", (event) => event.stopPropagation());
      expand.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleInspector(box.id);
      });
      row.appendChild(expand);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "vmmoss-ico";
      del.textContent = "✕";
      del.title = t("delTip");
      del.addEventListener("click", (event) => { event.stopPropagation(); removeBox(box.id); });
      row.appendChild(del);

      row.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button, select, input, textarea, .grip")) return;
        S.sel = box.id;
        refreshSelection();
        draw();
        event.stopPropagation();
      });

      row.addEventListener("dblclick", (event) => {
        if (event.target.closest("button, select, input, textarea")) return;
        event.stopPropagation();
        openInspector(box.id);
      });

      setupGripDrag(grip, row, box);
      rows.appendChild(row);
    });

    if (!boxes.length) {
      const hint = document.createElement("div");
      hint.className = "vmmoss-empty";
      hint.textContent = t("empty");
      rows.appendChild(hint);
    }
    rows.style.height = `${rowsHeightFor(boxes.length)}px`;
    syncToggleAll();
    renderInspector();
    if (!S.drag) applyLayout(true);
    rows.scrollTop = scrollTop;
  }

  // --- V2.3 expandable text inspector ---------------------------------
  /** Mirror drawer edits back into the compact row inputs. */
  function syncRowInputs(box) {
    const row = rowFor(box.id);
    if (!row) return;
    // Each row holds at most one <textarea> (exact text) and one <input> (caption).
    const textArea = row.querySelector("textarea");
    const captionInput = row.querySelector("input");
    if (textArea && textArea.value !== box.text) textArea.value = box.text;
    if (captionInput && captionInput.value !== box.caption) captionInput.value = box.caption;
  }

  /** Push external changes (row edits, onExecuted, imports) into the open drawer. */
  function syncInspectorValues(box) {
    if (!inspector.classList.contains("show") || inspector.dataset.box !== box.id) return;
    for (const field of ["text", "caption"]) {
      const area = inspector.querySelector(`.vmmoss-insp-${field}`);
      if (!area) continue;
      if (document.activeElement !== area && area.value !== (box[field] || "")) area.value = box[field] || "";
    }
  }

  function mkInspectorField(box, field, labelText, tip) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const area = document.createElement("textarea");
    area.dataset.field = field;
    area.className = `vmmoss-insp-${field}`;
    if (field === "caption") area.classList.add("vmmoss-insp-single");
    area.rows = 12;
    // Share each field's preferred height across regions, independently of prompts.
    const savedHeight = num(node.properties?.[INSPECTOR_HEIGHTS_PROP]?.[field]);
    if (savedHeight > 0) area.style.height = `${Math.max(field === "caption" ? 46 : 42, savedHeight)}px`;
    area.value = box[field] || "";
    area.placeholder = field === "text"
      ? t("placeholderText")
      : box.label === "text" ? t("placeholderStyle") : t("placeholderCaption");
    area.title = tip;
    area.addEventListener("input", () => {
      // Execution, imports and canvas resizing can replace the box object while
      // this drawer stays open. Resolve its current target instead of mutating
      // the detached object captured when the textarea was created.
      const current = S.state.boxes.find((candidate) => candidate.id === box.id);
      if (!current) return;
      current[field] = area.value;
      commit();
      draw();
      updateFoot();
      syncRowInputs(current);
    });
    area.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const rect = area.getBoundingClientRect();
      if (event.clientX >= rect.right - 16 && event.clientY >= rect.bottom - 16) inspectorResizeTarget = area;
    });
    area.addEventListener("keydown", (event) => event.stopPropagation());
    if (field === "caption") autocomplete.bind(area);
    wrap.append(label, area);
    return wrap;
  }

  function buildInspector(box) {
    endInspectorResize();
    autocomplete.clear(inspector);
    inspector.innerHTML = "";
    inspector.dataset.box = box.id;
    const tags = displayTags(S.state.boxes);
    const head = document.createElement("div");
    head.className = "head";
    const title = document.createElement("span");
    title.textContent = `📝 ${t("inspectorTitle")}`;
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tags[box.id] || "";
    const hint = document.createElement("span");
    hint.style.cssText = "font-size:9px;color:#6f7d92;";
    hint.textContent = t("inspectorFollow");
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "vmmoss-btn vmmoss-insp-close";
    collapse.style.cssText = "padding:2px 6px;font-size:9.5px;";
    collapse.textContent = `▴ ${t("inspectorCollapse")}`;
    collapse.addEventListener("click", (event) => { event.stopPropagation(); closeInspector(); });
    head.append(title, chip, hint, spacer, collapse);
    inspector.appendChild(head);

    if (box.label === "text") {
      inspector.appendChild(mkInspectorField(box, "text", t("inspectorText"), t("inspectorTextTip")));
    }
    inspector.appendChild(mkInspectorField(box, "caption", t("inspectorStyle"), t("inspectorStyleTip")));
  }

  function renderInspector(force = false) {
    const box = S.inspector ? S.state.boxes.find((b) => b.id === S.inspector) : null;
    if (!box) {
      S.inspector = null;
      autocomplete.clear(inspector);
      const wasShown = inspector.classList.contains("show");
      if (wasShown) {
        endInspectorResize();
        inspector.classList.remove("show");
        inspector.innerHTML = "";
        inspector.removeAttribute("data-box");
        applyLayout(true);
      } else if (force) {
        inspector.innerHTML = "";
        inspector.removeAttribute("data-box");
      }
      return;
    }
    const same = !force && inspector.dataset.box === box.id && inspector.classList.contains("show");
    if (same) {
      syncInspectorValues(box);
      return;
    }
    buildInspector(box);
    inspector.classList.add("show");
    applyLayout(true);
  }

  function openInspector(id) {
    if (!id || !S.state.boxes.some((box) => box.id === id)) return;
    S.inspector = id;
    S.sel = id;
    buildInspector(S.state.boxes.find((box) => box.id === id));
    inspector.classList.add("show");
    rebuildRows();
    refreshSelection();
    draw();
    updateFoot();
  }

  function closeInspector() {
    if (!S.inspector) return;
    S.inspector = null;
    renderInspector(true);
    rebuildRows();
    draw();
  }

  function toggleInspector(id) {
    if (S.inspector === id) closeInspector();
    else openInspector(id);
  }

  function setupGripDrag(grip, row, box) {
    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startIndex = S.state.boxes.findIndex((b) => b.id === box.id);
      let target = startIndex;
      grip.setPointerCapture(event.pointerId);
      const showInsert = (index) => {
        insert.style.top = `${clamp(4 + index * ROW_H - rows.scrollTop, 0, rows.clientHeight - 2)}px`;
        insert.style.display = "block";
      };
      showInsert(startIndex);
      const onMove = (moveEvent) => {
        const rect = rows.getBoundingClientRect();
        const local = (moveEvent.clientY - rect.top) * rows.offsetHeight / rect.height
          - rows.clientTop + rows.scrollTop;
        target = clamp(Math.round(local / ROW_H), 0, S.state.boxes.length);
        showInsert(target);
      };
      const onUp = (upEvent) => {
        if (upEvent.type !== "pointercancel") onMove(upEvent);
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
        grip.removeEventListener("pointercancel", onUp);
        insert.style.display = "none";
        if (target !== startIndex && target !== startIndex + 1) {
          const [moved] = S.state.boxes.splice(startIndex, 1);
          S.state.boxes.splice(target > startIndex ? target - 1 : target, 0, moved);
          commit(); rebuildRows(); draw(); updateFoot();
        }
      };
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
      grip.addEventListener("pointercancel", onUp);
    });
  }

  function removeBox(id) {
    const index = S.state.boxes.findIndex((box) => box.id === id);
    if (index < 0) return;
    S.state.boxes.splice(index, 1);
    if (S.sel === id) S.sel = null;
    if (S.inspector === id) S.inspector = null;
    commit(); rebuildRows(); draw(); updateFoot();
  }

  function updateFoot() {
    renderPixelControls();
    const { w, h } = liveSize();
    const boxes = S.state.boxes;
    const visible = boxes.filter((b) => b.visible).length;
    const order = effectiveOrder(boxes.filter((b) => b.visible), orderMode());
    const tags = displayTags(boxes);
    const linked = ["width", "height"].some((name) => node.inputs?.some((i) => i.name === name && i.link != null));
    const externalLinked = node.inputs?.some((i) => i.name === "external_layout_json" && i.link != null);

    foot.innerHTML = "";
    const add = (text, cls = "") => {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      foot.appendChild(span);
    };
    add(`${t("footCanvas")} ${w}×${h}`);
    add(`${t("footBase")} ${S.state.base_width}×${S.state.base_height}`);
    add(t("footBoxes", { n: boxes.length, v: visible }));
    add(`${t("footOrder")} ${order.map((b) => tags[b.id]).join("→") || "—"}`);
    if (syncMode() === SYNC_CENTER) add(t("centerSyncTip"));
    if (linked) add(t("linked"), "warn");
    if (externalLinked) {
      const mode = String(W.externalMode?.value || "");
      add(t("externalOn", { mode: mode.replace(/\s*\(.*\)$/, "") }), "warn");
    }
    if (node.inputs?.some((input) => input.name === "box_texts_in" && input.link != null)) {
      add(t("textLink"), "warn");
    }
    const missing = boxes.filter((b) => b.label === "text" && !b.text.trim()).length;
    if (missing) add(t("noText", { n: missing }), "warn");
    if (!boxes.length) add(t("emptyPrompt"));
  }

  // --- hit test (topmost first, F05) -------------------------------
  function localPoint(event) {
    // Graph zoom scales getBoundingClientRect but not S.canvasW/H, so convert
    // through the ratio first; the result is unscaled canvas-local CSS px.
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * S.canvasW,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * S.canvasH,
    };
  }

  function toNorm(event) {
    const local = localPoint(event);
    return viewToCanvas(S.view, local.x, local.y, S.canvasW, S.canvasH);
  }

  function hitTest(point) {
    if (S.sel) {
      const box = S.state.boxes.find((b) => b.id === S.sel && b.visible);
      if (box) {
        const names = ["nw", "ne", "sw", "se"];
        const corners = cornersOf(box);
        const reach = 8 / Math.max(S.view.zoom, 1e-6);
        for (let i = 0; i < corners.length; i++) {
          if (Math.hypot(point.px - corners[i][0], point.py - corners[i][1]) <= reach) {
            return { box, handle: names[i] };
          }
        }
      }
    }
    const ordered = effectiveOrder(S.state.boxes, orderMode()).reverse();
    for (const box of ordered) {
      if (!box.visible) continue;
      const x1 = (box.cx - box.w / 2) * S.canvasW;
      const x2 = (box.cx + box.w / 2) * S.canvasW;
      const y1 = (box.cy - box.h / 2) * S.canvasH;
      const y2 = (box.cy + box.h / 2) * S.canvasH;
      if (point.px >= x1 && point.px <= x2 && point.py >= y1 && point.py <= y2) {
        return { box, handle: null };
      }
    }
    return { box: null, handle: null };
  }

  function clampBox(box) {
    const { w: W, h: H } = liveSize();
    const minW = MIN_BOX_PX / W;
    const minH = MIN_BOX_PX / H;
    if (box.lock_aspect && box.orig_aspect > 0) {
      const ratio = box.orig_aspect * (H / W);
      const scale = Math.min(1, 1 / Math.max(box.w, 1e-6), 1 / Math.max(box.h, 1e-6));
      box.w *= scale;
      box.h *= scale;
      if (box.w < minW || box.h < minH) {
        const coupledMin = Math.max(minW, minH * ratio);
        box.w = coupledMin;
        box.h = coupledMin / ratio;
      }
    } else {
      box.w = clamp(box.w, minW, 1);
      box.h = clamp(box.h, minH, 1);
    }
    box.cx = clamp(box.cx, box.w / 2, 1 - box.w / 2);
    box.cy = clamp(box.cy, box.h / 2, 1 - box.h / 2);
  }

  function moveBox(box, dx, dy, useSnap = true) {
    const { w: W, h: H } = liveSize();
    const snap = S.snap && useSnap;
    const snapNorm = (v, total) => (snap ? Math.round(v / (SNAP_PX / total)) * (SNAP_PX / total) : v);
    box.cx = snapNorm(box.cx + dx, W);
    box.cy = snapNorm(box.cy + dy, H);
    if (snap && (S.guides.thirds || S.guides.golden)) {
      // Composition guides win over the grid when the box is close enough.
      const snapped = snapBoxToGuides(box, W, H, S.guides);
      box.cx = snapped.cx;
      box.cy = snapped.cy;
    }
    clampBox(box);
  }

  // --- pointer -----------------------------------------------------
  /** Shared pointerdown body: pan on middle/space, otherwise select + drag. */
  function beginCanvasPointer(event) {
    // V2.2: while the eyedropper owns the canvas, a click samples and exits
    // instead of selecting or dragging a box.
    if (S.eye) {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 0) pickAtPointer(event);
      else if (event.button === 2) exitEyedropper();
      return;
    }
    if (event.button === 1 || (event.button === 0 && S.space)) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      S.pan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: S.view.panX,
        panY: S.view.panY,
        scaleX: S.canvasW / Math.max(rect.width, 1),
        scaleY: S.canvasH / Math.max(rect.height, 1),
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const point = toNorm(event);
    const hit = hitTest(point);
    if (!hit.box) {
      S.sel = null;
      refreshSelection();
      draw();
      return;
    }
    S.sel = hit.box.id;
    S.hover = hit.box.id;
    S.drag = {
      mode: hit.handle ? "resize" : "move",
      handle: hit.handle,
      id: hit.box.id,
      start: { x: point.x, y: point.y },
      origin: { cx: hit.box.cx, cy: hit.box.cy, w: hit.box.w, h: hit.box.h },
    };
    canvas.setPointerCapture(event.pointerId);
    refreshSelection();
    draw();
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    beginCanvasPointer(event);
  });

  // Chrome would start its autoscroll widget on middle click.
  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 1) { event.preventDefault(); event.stopPropagation(); }
  });
  canvas.addEventListener("auxclick", (event) => {
    if (event.button === 1) { event.preventDefault(); event.stopPropagation(); }
  });
  canvas.addEventListener("dblclick", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    // Must be immediate: the left-button handler below would create a text box.
    event.stopImmediatePropagation();
    resetView();
  });

  canvas.addEventListener("wheel", (event) => {
    // Fallback for hosts that do not intercept wheel above the node DOM.
    event.preventDefault();
    event.stopPropagation();
    applyWheelZoom(event);
  }, { passive: false });

  canvas.addEventListener("pointerenter", () => { S.inside = true; });
  canvas.addEventListener("pointerleave", () => { S.inside = false; });

  function applyPan(event) {
    const dx = (event.clientX - S.pan.startX) * S.pan.scaleX;
    const dy = (event.clientY - S.pan.startY) * S.pan.scaleY;
    S.view = clampView(S.view.zoom, S.pan.panX + dx, S.pan.panY + dy, S.canvasW, S.canvasH);
    renderZoomBadge();
    draw();
  }

  function endPan() {
    S.pan = null;
    canvas.style.cursor = S.space ? "grab" : "crosshair";
  }

  canvas.addEventListener("pointermove", (event) => {
    if (S.eye) {
      // Loupe follows the cursor and re-samples every move (design §5.1.2).
      const point = canvasLocalPoint(event);
      S.eye.mx = point.x;
      S.eye.my = point.y;
      S.eye.hex = samplePixel(point.x, point.y)?.hex || null;
      S.eye.moved = true;
      if (canvas.style.cursor !== "copy") canvas.style.cursor = "copy";
      draw();
      return;
    }
    if (S.pan) {
      event.preventDefault();
      event.stopPropagation();
      applyPan(event);
      return;
    }
    if (!S.drag) {
      const point = toNorm(event);
      const hit = hitTest(point);
      const cursor = S.space ? "grab" : hit.handle ? "nwse-resize" : hit.box ? "move" : "crosshair";
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
      if (S.hover !== (hit.box?.id || null)) {
        S.hover = hit.box?.id || null;
        draw();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const box = S.state.boxes.find((b) => b.id === S.drag.id);
    if (!box) return;
    const point = toNorm(event);
    if (S.drag.mode === "move") {
      box.cx = S.drag.origin.cx;
      box.cy = S.drag.origin.cy;
      moveBox(box, point.x - S.drag.start.x, point.y - S.drag.start.y);
    } else {
      const next = resizeGeometry(box, S.drag.handle, point, liveSize().w, liveSize().h, S.snap);
      box.cx = next.cx; box.cy = next.cy; box.w = next.w; box.h = next.h;
    }
    draw();
  });

  const endDrag = (event) => {
    if (S.pan) {
      endPan();
      try { canvas.releasePointerCapture(event.pointerId); } catch (err) { /* already released */ }
      return;
    }
    if (!S.drag) return;
    const box = S.state.boxes.find((b) => b.id === S.drag.id);
    if (box) {
      const { w: W, h: H } = liveSize();
      box.orig_aspect = (box.w * W) / Math.max(box.h * H, 1e-6);
    }
    S.drag = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch (err) { /* already released */ }
    commit(); rebuildRows(); draw(); updateFoot();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("dblclick", (event) => {
    const point = toNorm(event);
    const hit = hitTest(point);
    if (!hit.box) { addBox("text"); return; }
    S.sel = hit.box.id;
    rebuildRows(); draw();
    const row = rowFor(hit.box.id);
    const input = row?.querySelector("input.vmmoss-inp, textarea.vmmoss-inp");
    input?.focus();
    input?.select?.();
  });

  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && S.eye) {
      event.preventDefault();
      event.stopPropagation();
      exitEyedropper();
      return;
    }
    if ((event.key === "i" || event.key === "I") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      enterEyedropper();
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      event.stopPropagation();
      resetView();
      return;
    }
    if (!["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    // Canvas editing keys belong here even when no layout box is selected.
    event.preventDefault();
    event.stopPropagation();
    const box = S.state.boxes.find((b) => b.id === S.sel);
    if (!box) return;
    const { w: W, h: H } = liveSize();
    const step = (event.shiftKey ? 10 : 1);
    switch (event.key) {
      case "Delete": case "Backspace": removeBox(box.id); break;
      case "ArrowLeft": moveBox(box, -step / W, 0, false); break;
      case "ArrowRight": moveBox(box, step / W, 0, false); break;
      case "ArrowUp": moveBox(box, 0, -step / H, false); break;
      case "ArrowDown": moveBox(box, 0, step / H, false); break;
    }
    commit(); rebuildRows(); draw(); updateFoot();
  });

  // --- toolbar actions --------------------------------------------
  function nextId() {
    let max = 0;
    for (const box of S.state.boxes) {
      const match = /^box_(\d+)$/.exec(box.id);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return `box_${max + 1}`;
  }

  function addBox(label) {
    const { w: W, h: H } = liveSize();
    const defaults = {
      text: { cx: 0.5, cy: 0.16, w: 0.82, h: 0.11, lock: true },
      character: { cx: 0.5, cy: 0.56, w: 0.46, h: 0.52, lock: true },
      object: { cx: 0.5, cy: 0.5, w: 0.34, h: 0.34, lock: false },
    }[label];
    const box = {
      id: nextId(),
      label,
      visible: true,
      lock_aspect: defaults.lock,
      cx: defaults.cx,
      cy: defaults.cy,
      w: defaults.w,
      h: defaults.h,
      orig_aspect: (defaults.w * W) / Math.max(defaults.h * H, 1e-6),
      text: "",
      caption: "",
      tags: [],
      palette: [],
    };
    clampBox(box);
    S.state.boxes.push(box);
    S.sel = box.id;
    commit(); rebuildRows(); draw(); updateFoot();
    rows.scrollTop = rows.scrollHeight;
    rowFor(box.id)?.querySelector("textarea, input")?.focus();
  }

  function targets() {
    if (S.sel) {
      const one = S.state.boxes.find((b) => b.id === S.sel);
      if (one) return [one];
    }
    return S.state.boxes.filter((b) => b.visible);
  }

  function alignCenter(axis) {
    for (const box of targets()) {
      if (axis === "x") box.cx = 0.5; else box.cy = 0.5;
    }
    commit(); draw(); updateFoot();
  }

  function matchSize(axis) {
    const visible = S.state.boxes.filter((box) => box.visible);
    if (visible.length < 2) return;
    const reference = (S.sel && visible.find((box) => box.id === S.sel)) || visible[0];
    const { w: W, h: H } = liveSize();
    const value = axis === "w" ? reference.w : reference.h;
    for (const box of visible) {
      if (box === reference) continue;
      if (axis === "w") {
        box.w = value;
        if (box.lock_aspect && box.orig_aspect > 0) {
          box.h = (box.w * W) / (box.orig_aspect * H);
        }
      } else {
        box.h = value;
        if (box.lock_aspect && box.orig_aspect > 0) {
          box.w = (box.h * H * box.orig_aspect) / W;
        }
      }
      clampBox(box);
    }
    commit(); draw(); updateFoot();
  }

  function distribute(axis) {
    const list = targets().slice();
    if (list.length < 3) return;
    list.sort((a, b) => (axis === "x" ? a.cx - b.cx : a.cy - b.cy));
    const first = axis === "x" ? list[0].cx : list[0].cy;
    const last = axis === "x" ? list[list.length - 1].cx : list[list.length - 1].cy;
    const step = (last - first) / (list.length - 1);
    list.forEach((box, index) => {
      if (axis === "x") box.cx = first + step * index; else box.cy = first + step * index;
    });
    commit(); draw(); updateFoot();
  }

  btnText.addEventListener("click", () => addBox("text"));
  btnChar.addEventListener("click", () => addBox("character"));
  btnObj.addEventListener("click", () => addBox("object"));
  btnImport.addEventListener("click", openImport);
  btnExport.addEventListener("click", openExport);
  btnSnap.addEventListener("click", () => {
    S.snap = !S.snap;
    btnSnap.classList.toggle("on", S.snap);
    btnSnap.textContent = S.snap ? t("snapOn") : t("snapOff");
  });
  btnCenterH.addEventListener("click", () => alignCenter("x"));
  btnCenterV.addEventListener("click", () => alignCenter("y"));
  btnMatchW.addEventListener("click", () => matchSize("w"));
  btnMatchH.addEventListener("click", () => matchSize("h"));
  btnDistH.addEventListener("click", () => distribute("x"));
  btnDistV.addEventListener("click", () => distribute("y"));
  btnClear.addEventListener("click", () => {
    if (!S.state.boxes.length) return;
    if (typeof window.confirm === "function" && !window.confirm(t("clear"))) return;
    S.state.boxes = [];
    S.sel = null;
    commit(); rebuildRows(); draw(); updateFoot();
  });

  // --- V2.1 toggle all visibility ----------------------------------
  function syncToggleAll() {
    const boxes = S.state.boxes;
    const allHidden = boxes.length > 0 && boxes.every((box) => !box.visible);
    btnToggleAll.textContent = allHidden ? t("showAll") : t("hideAll");
    btnToggleAll.title = allHidden ? t("showAllTip") : t("hideAllTip");
    btnToggleAll.classList.toggle("on", allHidden);
    btnToggleAll.disabled = boxes.length === 0;
  }

  btnToggleAll.addEventListener("click", () => {
    if (!S.state.boxes.length) return;
    const visible = nextAllVisible(S.state.boxes);
    S.state.boxes = setAllVisible(S.state.boxes, visible);
    if (!visible) S.sel = null;
    commit(); rebuildRows(); draw(); updateFoot();
  });

  // --- V2.1 zoom badge ---------------------------------------------
  zoomBadge.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  zoomBadge.addEventListener("click", (event) => {
    event.stopPropagation();
    resetView();
  });

  // --- V2.1 global palette bar -------------------------------------
  function themeIdFor(colors) {
    const key = colors.map((color) => String(color).toUpperCase()).join(",");
    for (const [id, theme] of Object.entries(PALETTE_THEMES)) {
      if (theme.colors.map((color) => color.toUpperCase()).join(",") === key) return id;
    }
    return THEME_CUSTOM;
  }

  function setGlobalPalette(colors) {
    S.state.palette = (colors || []).slice(0, 8);
    commit();
    renderPaletteBar();
    draw();
    updateFoot();
  }

  // --- V2.2 eyedropper ------------------------------------------------
  let refSampleCtx = null;
  let palHintTimer = 0;

  function flashPalette(text) {
    if (!palHint) return;
    palHint.textContent = text || "";
    if (palHintTimer) clearTimeout(palHintTimer);
    if (!text) return;
    palHintTimer = setTimeout(() => { palHint.textContent = ""; palHintTimer = 0; }, 2600);
  }

  /** Resolve where a picked colour lands: an explicit box id, or the global palette. */
  function pickTargetFor(explicit) {
    if (explicit === "global") return "global";
    if (typeof explicit === "string" && S.state.boxes.some((box) => box.id === explicit)) return explicit;
    return S.sel && S.state.boxes.some((box) => box.id === S.sel) ? S.sel : "global";
  }

  /** Write one colour into the resolved palette. Returns false on duplicate / full. */
  function commitPickedColor(hex, targetId) {
    const value = normalizeHex(hex);
    if (!value) return false;
    const target = pickTargetFor(targetId);
    if (target !== "global") {
      const box = S.state.boxes.find((b) => b.id === target);
      if (box) {
        const current = Array.isArray(box.palette) ? box.palette : [];
        const next = pushPaletteColor(current, value, 4);
        if (next.length === current.length) {
          flashPalette(current.length >= 4 ? t("pickFull") : t("pickDuplicate"));
          return false;
        }
        setBoxPalette(box, next);
        return true;
      }
    }
    const current = Array.isArray(S.state.palette) ? S.state.palette : [];
    const next = pushPaletteColor(current, value, 8);
    if (next.length === current.length) {
      flashPalette(current.length >= 8 ? t("pickFull") : t("pickDuplicate"));
      return false;
    }
    setGlobalPalette(next);
    return true;
  }

  /** Read a single pixel out of a 2D context without ever throwing. */
  function readPixel(context, x, y) {
    try {
      const data = context?.getImageData?.(x, y, 1, 1)?.data;
      if (!data || data.length < 4) return null;
      return [data[0], data[1], data[2], data[3]];
    } catch (err) {
      return null;
    }
  }

  /** Freeze the reference image into an offscreen buffer so overlays never tint the sample. */
  function buildRefSample() {
    refSampleCtx = null;
    const image = S.ref?.image;
    if (!image?.naturalWidth) return false;
    const width = Math.max(1, Math.round(S.canvasW));
    const height = Math.max(1, Math.round(S.canvasH));
    try {
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const offCtx = off.getContext?.("2d", { willReadFrequently: true });
      if (!offCtx) return false;
      offCtx.drawImage?.(image, ...referenceRect(S.state, width, height, syncMode()));
      refSampleCtx = offCtx;
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Sample the pixel under a canvas-local point (CSS px inside the canvas element). */
  function samplePixel(localX, localY) {
    let px = null;
    if (refSampleCtx) {
      const point = viewToCanvas(S.view, localX, localY, S.canvasW, S.canvasH);
      const x = clamp(Math.floor(point.px), 0, refSampleCtx.canvas.width - 1);
      const y = clamp(Math.floor(point.py), 0, refSampleCtx.canvas.height - 1);
      px = readPixel(refSampleCtx, x, y);
      if (px?.[3] === 0) px = null; // Padding samples the displayed canvas, never a stretched edge pixel.
    }
    if (!px) {
      // The rendered canvas already includes zoom/pan. Redraw without the loupe
      // before sampling so its ring, crosshair and label cannot feed back into RGB.
      draw(false);
      const x = clamp(Math.floor(num(localX, 0) * S.dpr), 0, canvas.width - 1);
      const y = clamp(Math.floor(num(localY, 0) * S.dpr), 0, canvas.height - 1);
      px = readPixel(ctx, x, y);
    }
    if (!px) return null;
    return { hex: hexFromRgb(px[0], px[1], px[2]), r: px[0], g: px[1], b: px[2] };
  }

  function canvasLocalPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    return {
      x: ((event.clientX - rect.left) / width) * S.canvasW,
      y: ((event.clientY - rect.top) / height) * S.canvasH,
    };
  }

  function enterEyedropper(explicit, degraded = false) {
    const target = pickTargetFor(explicit);
    S.eye = { target, hex: null, mx: -1, my: -1, moved: false };
    buildRefSample();
    canvas.style.cursor = "copy";
    canvas.title = t("pickCanvasHint");
    // A degraded entry explains why the full-screen picker did not open.
    flashPalette(degraded ? t("pickFallback") : t("pickCanvasHint"));
    draw();
    return target;
  }

  function exitEyedropper() {
    if (!S.eye) return;
    S.eye = null;
    canvas.style.cursor = "crosshair";
    canvas.title = t("canvasTip");
    flashPalette("");
    draw();
  }

  /** Click-to-confirm inside the canvas eyedropper. */
  function pickAtPointer(event) {
    if (!S.eye) return false;
    const point = canvasLocalPoint(event);
    const sample = samplePixel(point.x, point.y);
    const target = S.eye.target;
    const ok = sample?.hex ? commitPickedColor(sample.hex, target) : false;
    exitEyedropper();
    return ok;
  }

  /** Native first, in-canvas fallback second (design §5.1). */
  function requestPick(explicit) {
    const target = pickTargetFor(explicit);
    return pickColorWithEyedropper(
      (hex) => { commitPickedColor(hex, target); },
      { targetLabel: target, fallback: () => { enterEyedropper(target, true); } },
    );
  }

  /** Reference image → 4 dominant colours → global palette. */
  function sampleRefPixels(size = 48) {
    const image = S.ref?.image;
    if (!image?.naturalWidth) return null;
    try {
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const offCtx = off.getContext?.("2d", { willReadFrequently: true });
      if (!offCtx) return null;
      offCtx.drawImage?.(image, 0, 0, size, size);
      const data = offCtx.getImageData?.(0, 0, size, size)?.data;
      return data && data.length ? data : null;
    } catch (err) {
      return null;
    }
  }

  function extractPaletteFromRef() {
    if (!S.ref?.image?.naturalWidth) {
      flashPalette(t("extractNoRef"));
      return null;
    }
    const data = sampleRefPixels(48);
    const colors = data ? extractDominantColorsFromPixels(data, 4) : [];
    if (!colors.length) {
      flashPalette(t("extractFail"));
      return null;
    }
    setGlobalPalette(colors);
    flashPalette(t("extractDone", { n: colors.length }));
    return colors;
  }

  function mkSwatch(color, { onPick, onRemove, removeTip } = {}) {
    const hex = normalizeHex(color);
    const wrap = document.createElement("span");
    wrap.className = "vmmoss-swatch";
    const chip = document.createElement("i");
    chip.style.background = hex || "transparent";
    if (!hex) { chip.style.borderStyle = "dashed"; chip.style.borderColor = "#6f6f80"; }
    chip.title = color;
    if (onPick) {
      chip.style.cursor = "pointer";
      chip.addEventListener("click", onPick);
    }
    wrap.appendChild(chip);
    const label = document.createElement("b");
    label.textContent = hex || String(color).slice(0, 10);
    wrap.appendChild(label);
    if (onRemove) {
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.title = removeTip || t("paletteRemove");
      x.addEventListener("click", (event) => { event.stopPropagation(); onRemove(); });
      wrap.appendChild(x);
    }
    return wrap;
  }

  function renderPaletteBar() {
    const colors = Array.isArray(S.state.palette) ? S.state.palette : [];
    palLabel.textContent = `${t("paletteLabel")}:`;
    palLabel.title = t("paletteTip");
    palBar.title = t("paletteTip");
    palAdd.title = t("paletteAddTip");
    palAdd.textContent = "🎨+";
    palPick.textContent = `💧 ${t("pickColor")}`;
    palPick.title = t("pickColorTip");
    const hasRef = !!S.ref?.image?.naturalWidth;
    palExtract.textContent = `🎨 ${t("extractPalette")}`;
    palExtract.title = hasRef ? t("extractPaletteTip") : t("extractNoRef");
    palExtract.style.display = hasRef ? "" : "none";

    const active = themeIdFor(colors);
    palTheme.innerHTML = "";
    const themePlaceholder = document.createElement("option");
    themePlaceholder.value = THEME_CUSTOM;
    themePlaceholder.textContent = t("paletteThemeCustom");
    palTheme.appendChild(themePlaceholder);
    for (const [id, theme] of Object.entries(PALETTE_THEMES)) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = lang() === "zh" ? theme.zh : theme.en;
      if (id === active) option.selected = true;
      palTheme.appendChild(option);
    }
    palTheme.value = active;
    palTheme.title = t("paletteTip");

    [...palSwatches.children].forEach((node) => node.remove());
    colors.forEach((color, index) => {
      palSwatches.appendChild(mkSwatch(color, {
        removeTip: t("paletteRemoveGlobal"),
        onRemove: () => setGlobalPalette(colors.filter((_, i) => i !== index)),
      }));
    });
    if (!colors.length) {
      const empty = document.createElement("span");
      empty.style.cssText = "font-size:9.5px;color:#5c5c6b;";
      empty.textContent = t("paletteEmpty");
      palSwatches.appendChild(empty);
    }
  }

  palTheme.addEventListener("change", () => {
    const theme = PALETTE_THEMES[palTheme.value];
    if (!theme) return;
    setGlobalPalette(theme.colors);
  });
  palTheme.addEventListener("pointerdown", (event) => event.stopPropagation());
  palAdd.addEventListener("click", (event) => {
    event.stopPropagation();
    palPicker.click();
  });
  // A native picker emits many input events during one gesture. Add only its committed colour.
  palPicker.addEventListener("change", () => {
    setGlobalPalette(pushPaletteColor(S.state.palette || [], palPicker.value, 8));
  });
  palPicker.addEventListener("pointerdown", (event) => event.stopPropagation());

  // --- V2.2 eyedropper + extraction buttons --------------------------
  palPick.addEventListener("pointerdown", (event) => event.stopPropagation());
  palPick.addEventListener("click", (event) => {
    event.stopPropagation();
    requestPick("global");
  });
  palExtract.addEventListener("pointerdown", (event) => event.stopPropagation());
  palExtract.addEventListener("click", (event) => {
    event.stopPropagation();
    extractPaletteFromRef();
  });
  refExtract.addEventListener("pointerdown", (event) => event.stopPropagation());
  refExtract.addEventListener("click", (event) => {
    event.stopPropagation();
    extractPaletteFromRef();
  });

  // --- V2.1 per-box palette popover --------------------------------
  function closePalettePop() {
    if (!S.pop) return;
    document.removeEventListener("pointerdown", S.pop.onDoc, true);
    S.pop.el.remove();
    S.pop = null;
  }

  function setBoxPalette(box, colors) {
    box.palette = colors.slice(0, 4);
    commit();
    rebuildRows();
    draw();
    updateFoot();
  }

  function openPalettePop(box, anchor) {
    const same = S.pop?.box === box.id;
    closePalettePop();
    if (same) return;

    const pop = document.createElement("div");
    pop.className = "vmmoss-pop";
    pop.dataset.box = box.id;
    pop.addEventListener("pointerdown", (event) => event.stopPropagation());
    pop.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });

    const hint = (text = "") => {
      hintEl.textContent = text;
      hintEl.style.color = text === t("paletteFull") ? "#e0a34a" : "#ef7f8f";
    };

    const head = document.createElement("h4");
    const title = document.createElement("span");
    title.textContent = t("paletteLayer");
    const tag = document.createElement("span");
    tag.textContent = displayTags(S.state.boxes)[box.id] || "";
    head.append(title, tag);

    const cur = document.createElement("div");
    cur.className = "cur";

    const quickTitle = document.createElement("div");
    quickTitle.className = "sub";
    quickTitle.textContent = t("paletteQuick");

    const grid = document.createElement("div");
    grid.className = "grid";
    for (const color of QUICK_COLORS) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.dataset.color = color;
      cell.style.background = color;
      cell.title = color;
      cell.addEventListener("click", () => { addColor(color); });
      grid.appendChild(cell);
    }

    const customTitle = document.createElement("div");
    customTitle.className = "sub";
    customTitle.textContent = t("paletteCustom");

    const bar = document.createElement("div");
    bar.className = "bar";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "vmmoss-pop-color";
    picker.value = normalizeHex(box.palette?.[0]) || "#F59E0B";
    const text = document.createElement("input");
    text.type = "text";
    text.className = "vmmoss-pop-text";
    text.placeholder = t("paletteInputPlaceholder");
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "vmmoss-btn vmmoss-pop-add";
    addBtn.style.cssText = "padding:2px 6px;font-size:9.5px;";
    addBtn.textContent = t("paletteAddColor");
    // V2.2: per-box eyedropper sits in the free-picker row.
    const popPick = document.createElement("button");
    popPick.type = "button";
    popPick.className = "vmmoss-btn vmmoss-pop-pick";
    popPick.style.cssText = "padding:2px 6px;font-size:9.5px;";
    popPick.textContent = `💧 ${t("pickColorLayer")}`;
    popPick.title = t("pickColorLayerTip");
    bar.append(picker, text, addBtn, popPick);

    const hintEl = document.createElement("div");
    hintEl.className = "hint";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "vmmoss-btn vmmoss-pop-clear";
    clearBtn.style.cssText = "padding:2px 6px;font-size:9.5px;";
    clearBtn.textContent = t("paletteClearBox");
    clearBtn.addEventListener("click", () => {
      setBoxPalette(box, []);
      hint("");
      refreshCur();
    });
    const footBar = document.createElement("div");
    footBar.className = "bar";
    footBar.style.justifyContent = "flex-end";
    footBar.appendChild(clearBtn);

    function refreshCur() {
      [...cur.children].forEach((node) => node.remove());
      const colors = Array.isArray(box.palette) ? box.palette : [];
      if (!colors.length) {
        const empty = document.createElement("span");
        empty.style.cssText = "font-size:9.5px;color:#5c5c6b;";
        empty.textContent = t("paletteEmpty");
        cur.appendChild(empty);
        return;
      }
      colors.forEach((color, index) => {
        cur.appendChild(mkSwatch(color, {
          onPick: () => editIndex(index),
          onRemove: () => {
            setBoxPalette(box, colors.filter((_, i) => i !== index));
            refreshCur();
          },
        }));
      });
    }

    const editPicker = document.createElement("input");
    editPicker.type = "color";
    editPicker.style.display = "none";
    let editing = -1;
    function editIndex(index) {
      editing = index;
      editPicker.value = normalizeHex(box.palette?.[index]) || "#FFFFFF";
      editPicker.click();
    }
    editPicker.addEventListener("input", () => {
      if (editing < 0) return;
      const colors = (box.palette || []).slice();
      colors[editing] = normalizeHex(editPicker.value) || colors[editing];
      setBoxPalette(box, colors);
      refreshCur();
    });

    /** Shared add path: dedupe, cap at 4, and keep unknown colour words. */
    function addColor(value) {
      const current = box.palette || [];
      const raw = String(value ?? "").trim();
      const normalized = normalizeHex(raw) || raw;
      if (!normalized) { hint(t("paletteInvalid")); return false; }
      if (current.some((color) => String(color).toUpperCase() === normalized.toUpperCase())) {
        hint(t("paletteDuplicate"));
        return false;
      }
      if (current.length >= 4) { hint(t("paletteFull")); return false; }
      setBoxPalette(box, [...current, normalized]);
      refreshCur();
      hint("");
      return true;
    }

    addBtn.addEventListener("click", () => {
      if (!text.value.trim()) return;
      if (addColor(text.value)) text.value = "";
    });
    text.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (addColor(text.value)) text.value = "";
    });
    picker.addEventListener("change", () => { addColor(picker.value); });
    popPick.addEventListener("click", (event) => {
      event.stopPropagation();
      pickColorWithEyedropper(
        (hex) => { if (addColor(hex)) hint(""); },
        {
          targetLabel: box.id,
          fallback: () => { closePalettePop(); enterEyedropper(box.id); },
        },
      );
    });

    pop.append(head, cur, quickTitle, grid, customTitle, bar, hintEl, footBar, editPicker);
    document.body.appendChild(pop);

    const rect = anchor.getBoundingClientRect();
    const width = 228;
    const height = pop.offsetHeight || 240;
    const left = clamp(rect.left, 6, Math.max(6, (window.innerWidth || 1024) - width - 8));
    let top = rect.bottom + 4;
    if (top + height > (window.innerHeight || 800) - 6) top = Math.max(6, rect.top - height - 4);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    const onDoc = (event) => {
      if (pop.contains(event.target) || anchor.contains(event.target)) return;
      closePalettePop();
    };
    document.addEventListener("pointerdown", onDoc, true);
    S.pop = { el: pop, box: box.id, onDoc };
    refreshCur();
  }

  // --- reference image --------------------------------------------
  function setRef(info) {
    if (!info?.thumbnail) {
      S.ref = null;
      refSampleCtx = null;
      if (S.eye) exitEyedropper();
      renderRefBar();
      renderPaletteBar();
      applyLayout(true);
      draw();
      return;
    }
    const image = new Image();
    S.ref = { ...info, image };
    image.onload = () => {
      if (S.ref?.image !== image) return;
      renderPaletteBar();
      applyLayout(true);
      draw();
    };
    image.src = info.thumbnail;
    refBar.classList.add("show");
    renderRefBar();
    applyLayout(true);
  }

  function renderRefBar() {
    if (!S.ref?.size) {
      refBar.classList.remove("show");
      return;
    }
    refBar.classList.add("show");
    refLabel.textContent = t("refLabel", { w: S.ref.size[0], h: S.ref.size[1] });
    refMatch.textContent = t("refMatch", { w: S.ref.aligned[0], h: S.ref.aligned[1] });
    refMatch.title = t("refTip");
    refExtract.textContent = `🎨 ${t("extractPalette")}`;
    refExtract.title = t("extractPaletteTip");
    refOpacityLabel.textContent = t("refOpacity");
  }

  refMatch.addEventListener("click", () => {
    if (!S.ref?.aligned) return;
    setWidgetValue(W.preset, PRESET_CUSTOM);
    setWidgetValue(W.width, S.ref.aligned[0]);
    setWidgetValue(W.height, S.ref.aligned[1]);
    onSizeChanged();
  });
  refOpacity.addEventListener("input", () => draw());
  refOpacity.addEventListener("pointerdown", (event) => event.stopPropagation());

  // --- size / preset plumbing -------------------------------------
  function onSizeChanged() {
    if (S.suppress > 0) return;
    const { w, h } = liveSize();
    if (w !== S.state.base_width || h !== S.state.base_height) {
      const mode = syncMode();
      syncReferenceSize(S.state, w, h, mode);
      S.state.boxes = S.state.boxes.map((box) => {
        const next = syncBoxAspectRatio(box, S.state.base_width, S.state.base_height, w, h, mode);
        return { ...box, ...next };
      });
      S.state.base_width = w;
      S.state.base_height = h;
      commit();
    }
    applyLayout(true);
    if (S.eye) buildRefSample();
    rebuildRows();
    draw();
    updateFoot();
  }

  function hookWidget(widget, onChange) {
    if (!widget || widget._vmMossHooked) return;
    widget._vmMossHooked = true;
    if (!widget._vmMossOriginal) widget._vmMossOriginal = widget.callback;
    widget.callback = function (value, ...rest) {
      let out;
      try { out = widget._vmMossOriginal ? widget._vmMossOriginal.apply(this, [value, ...rest]) : undefined; }
      catch (err) { console.warn("[VM MOSS]", err); }
      if (S.suppress === 0) {
        try { onChange(value); } catch (err) { console.error("[VM MOSS]", err); }
      }
      return out;
    };
  }

  function setWidgetValue(widget, value) {
    if (!widget) return;
    S.suppress++;
    try {
      widget.value = value;
      try { widget._vmMossOriginal?.call(widget, value); } catch (err) { /* host callback args vary */ }
    } finally {
      S.suppress--;
    }
  }

  hookWidget(W.language, () => { applyLanguage(); rebuildRows(); draw(); updateFoot(); renderRefBar(); });
  hookWidget(W.preset, () => {
    const dims = PRESETS[W.preset.value];
    if (dims) {
      setWidgetValue(W.width, dims[0]);
      setWidgetValue(W.height, dims[1]);
    }
    onSizeChanged();
  });
  hookWidget(W.width, () => {
    const dims = PRESETS[W.preset.value];
    if (dims && Math.round(num(W.width.value, 0)) !== dims[0]) setWidgetValue(W.preset, PRESET_CUSTOM);
    onSizeChanged();
  });
  hookWidget(W.height, () => {
    const dims = PRESETS[W.preset.value];
    if (dims && Math.round(num(W.height.value, 0)) !== dims[1]) setWidgetValue(W.preset, PRESET_CUSTOM);
    onSizeChanged();
  });
  hookWidget(W.sync, () => {
    // Switching mode establishes the current canvas as the reference alignment base.
    delete S.state.reference_size;
    commit();
    if (S.eye) buildRefSample();
    draw(); updateFoot();
  });
  for (const widget of [W.meta, W.canvas, W.order, W.externalMode, W.customTags]) {
    hookWidget(widget, () => updateFoot());
  }

  const originalConnections = node.onConnectionsChange;
  node.onConnectionsChange = function () {
    const out = originalConnections?.apply(this, arguments);
    try {
      const linked = ["width", "height"].some((name) => node.inputs?.some((i) => i.name === name && i.link != null));
      if (linked && PRESETS[W.preset.value]) {
        setWidgetValue(W.preset, PRESET_CUSTOM);
        onSizeChanged();
      }
      if (S.ref && !node.inputs?.some((input) => input.name === "ref_image" && input.link != null)) {
        setRef(null);
      }
      updateFoot();
    } catch (err) { /* ignore */ }
    return out;
  };

  // --- language ----------------------------------------------------
  function applyLanguage() {
    const zh = lang() === "zh";
    const title = t("title");
    if (!node.title || node.title === I18N.zh.title || node.title === I18N.en.title) node.title = title;
    // Widget labels are translated in place; option values stay canonical so
    // saved workflows keep working across languages.
    const dict = zh ? LANG_LABELS.zh : LANG_LABELS.en;
    const pairs = [
      [W.language, "language"], [W.preset, "preset"], [W.width, "width"], [W.height, "height"],
      [W.sync, "sync"], [W.meta, "meta"], [W.canvas, "canvas"], [W.order, "order"],
      [W.caption, "caption"], [W.externalMode, "externalMode"], [W.customTags, "customTags"],
    ];
    for (const [widget, key] of pairs) {
      if (widget) widget.label = dict[key];
    }
    if (W.caption) {
      W.caption.options ||= {};
      W.caption.options.placeholder = t("placeholderGlobal");
      if (W.caption.inputEl) W.caption.inputEl.placeholder = t("placeholderGlobal");
    }

    renderPixelControls();
    btnText.textContent = t("addText"); btnText.title = t("addTextTip");
    btnChar.textContent = t("addChar"); btnChar.title = t("addCharTip");
    btnObj.textContent = t("addObj"); btnObj.title = t("addObjTip");
    btnImport.textContent = t("importJson"); btnImport.title = t("importTip");
    btnExport.textContent = t("exportJson"); btnExport.title = t("exportTip");
    btnSnap.textContent = S.snap ? t("snapOn") : t("snapOff"); btnSnap.title = t("snapTip");
    btnCenterH.textContent = t("centerH"); btnCenterH.title = t("centerHTip");
    btnCenterV.textContent = t("centerV"); btnCenterV.title = t("centerVTip");
    btnMatchW.textContent = t("matchW"); btnMatchW.title = t("matchWTip");
    btnMatchH.textContent = t("matchH"); btnMatchH.title = t("matchHTip");
    btnDistH.textContent = t("distH"); btnDistH.title = t("distHTip");
    btnDistV.textContent = t("distV"); btnDistV.title = t("distVTip");
    btnClear.textContent = t("clear"); btnClear.title = t("clearTip");
    syncGuideButtons();
    if (S.inspector) renderInspector(true);
    syncToggleAll();
    renderPaletteBar();
    renderZoomBadge();
    if (S.pop) closePalettePop();
    btnLang.innerHTML = "";
    btnLang.title = t("toggleTitle");
    for (const [label, active] of [["中文", zh], [" | ", null], ["EN", !zh]]) {
      const span = document.createElement("span");
      span.textContent = label;
      if (active !== null) {
        span.style.opacity = active ? "1" : "0.45";
        span.style.fontWeight = active ? "700" : "400";
      } else {
        span.style.opacity = "0.45";
      }
      btnLang.appendChild(span);
    }
    canvas.title = t("canvasTip");
    renderRefBar();
    if (S.modal) closeModal();
  }

  // --- modal (import / export) ------------------------------------
  function openModal({ title, hint, value, readonly, actions }) {
    closeModal();
    const overlay = document.createElement("div");
    overlay.className = "vmmoss-modal";
    overlay.addEventListener("pointerdown", (event) => event.stopPropagation());
    overlay.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    const card = document.createElement("div");
    card.className = "vmmoss-card";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = hint;
    const area = document.createElement("textarea");
    area.value = value || "";
    area.readOnly = !!readonly;
    area.spellcheck = false;
    const status = document.createElement("div");
    status.className = "vmmoss-status";
    const row = document.createElement("div");
    row.className = "row";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `vmmoss-btn ${action.cls || ""}`.trim();
      button.textContent = action.label;
      button.addEventListener("click", () => action.run(area, status, closeModal));
      row.appendChild(button);
    }
    card.append(heading, paragraph, area, status, row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    S.modal = overlay;
    area.focus();
  }

  function closeModal() {
    if (!S.modal) return;
    S.modal.remove();
    S.modal = null;
  }

  function applyImport(text, replace, status, close) {
    const input = String(text || "").trim();
    if (/^```(?:python|py)\b/i.test(input)
        || /^[ \t]*(?:import[ \t]+[\w.]+(?:[ \t]*$|[ \t]+as\b|[ \t]*,)|from[ \t]+[\w.]+[ \t]+import\b|(?:async[ \t]+)?def[ \t]+\w+[ \t]*\()/m.test(input)) {
      status.className = "vmmoss-status err";
      status.textContent = t("importScriptError");
      return;
    }
    const { w: currentW, h: currentH } = liveSize();
    let parsed;
    try {
      parsed = parseSkillJson(text, currentW, currentH, syncMode());
    } catch (err) {
      if (!(err instanceof RangeError) || err.message !== "compiledSizeError") throw err;
      status.className = "vmmoss-status err";
      status.textContent = t("compiledSizeError");
      return;
    }
    if (parsed && replace && (parsed.width !== currentW || parsed.height !== currentH)) {
      // Replace adopts the source canvas, so re-parse at that size to avoid a
      // premature aspect sync against the old canvas (F02).
      parsed = parseSkillJson(text, parsed.width, parsed.height, syncMode()) || parsed;
    }
    if (!parsed) {
      status.className = "vmmoss-status err";
      status.textContent = t("importFail");
      return;
    }
    if (parsed.kind === "caption") {
      setWidgetValue(W.caption, parsed.caption);
      S.state.caption = parsed.caption;
      commit();
      status.className = "vmmoss-status ok";
      status.textContent = t("importCaption");
      close?.();
      return;
    }
    applySummary(parsed);
    if (replace) {
      setWidgetValue(W.preset, PRESET_CUSTOM);
      setWidgetValue(W.width, parsed.width);
      setWidgetValue(W.height, parsed.height);
      S.state = {
        version: 2, base_width: parsed.width, base_height: parsed.height,
        boxes: parsed.boxes.map((box) => ({ ...box })),
      };
      S.state.caption = parsed.caption;
      S.state.meta = parsed.meta.slice();
      if (parsed.canvas) S.state.canvas = parsed.canvas;
      S.state.palette = parsed.palette.slice();
      S.sel = null;
      S.hover = null;
      resetView();
    } else {
      const byId = new Map(S.state.boxes.map((box) => [box.id, box]));
      for (const box of parsed.boxes) byId.set(box.id, { ...box });
      S.state.boxes = [...byId.values()];
    }
    commit();
    applyLayout(true);
    rebuildRows();
    renderPaletteBar();
    draw();
    updateFoot();
    status.className = "vmmoss-status ok";
    status.textContent = t("importOk", { n: parsed.boxes.length, w: parsed.width, h: parsed.height });
    close?.();
  }

  function applySummary(parsed) {
    if (parsed.caption !== undefined) {
      setWidgetValue(W.caption, parsed.caption);
      S.state.caption = parsed.caption;
    }
    if (Array.isArray(parsed.meta)) {
      const options = W.meta?.options?.values || [];
      const first = parsed.meta.find((tag) => options.includes(tag));
      const rest = parsed.meta.filter((tag) => tag !== first);
      if (first) setWidgetValue(W.meta, first);
      else if (W.meta) setWidgetValue(W.meta, META_NONE);
      setWidgetValue(W.customTags, rest.join(", "));
      S.state.meta = parsed.meta.slice();
    }
    if (parsed.canvas && W.canvas?.options?.values?.includes(parsed.canvas)) {
      setWidgetValue(W.canvas, parsed.canvas);
      S.state.canvas = parsed.canvas;
    }
    if (Array.isArray(parsed.palette)) S.state.palette = parsed.palette.slice();
  }

  function summaryForExport() {
    const metaOptions = W.meta?.options?.values || [];
    const selected = String(W.meta?.value || "");
    const tags = [];
    if (selected && selected !== META_NONE && metaOptions.includes(selected)) tags.push(selected);
    for (const tag of splitTags(W.customTags?.value || "")) {
      if (!tags.some((t0) => t0.toLowerCase() === tag.toLowerCase())) tags.push(tag);
    }
    return {
      caption: String(W.caption?.value || "").trim(),
      meta: tags,
      canvas: W.canvas?.value || "single",
      palette: S.state.palette || [],
      layerOrder: orderMode(),
      lang: lang(),
    };
  }

  function openImport() {
    openModal({
      title: t("modalImport"),
      hint: t("importHint"),
      value: "",
      actions: [
        { label: t("cancel"), run: (a, s, close) => close() },
        { label: t("mergeCanvas"), run: (a, s, close) => applyImport(a.value, false, s, close) },
        { label: t("replaceCanvas"), cls: "on", run: (a, s, close) => applyImport(a.value, true, s, close) },
      ],
    });
  }

  function openExport() {
    const { w, h } = liveSize();
    const draft = buildDraftJson(S.state, w, h, summaryForExport());
    const text = JSON.stringify(draft, null, 2);
    const filename = `moss-layout-${w}x${h}.json`;
    openModal({
      title: t("modalExport"),
      hint: t("exportHint"),
      value: text,
      readonly: true,
      actions: [
        { label: t("close"), run: (a, s, close) => close() },
        {
          label: t("copy"),
          run: async (a, s) => {
            try {
              await navigator.clipboard.writeText(a.value);
              s.className = "vmmoss-status ok";
              s.textContent = t("copied");
            } catch (err) {
              a.select();
              s.className = "vmmoss-status err";
              s.textContent = String(err);
            }
          },
        },
        {
          label: t("download"),
          run: (a, s) => {
            const blob = new Blob([a.value], { type: "application/json" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
          },
        },
      ],
    });
  }

  // --- widget + lifecycle ------------------------------------------
  const domWidget = node.addDOMWidget("vmmoss_ui", "vmmoss_ui", root, {
    serialize: false,
    hideOnZoom: false,
    getValue: () => "",
    setValue: () => {},
  });
  domWidget.serialize = false;
  domWidget.options.serialize = false;
  domWidget.computeSize = function (width) {
    return [Math.max(360, width || node.size?.[0] || 520), desiredHeight()];
  };

  for (const type of ["pointerdown", "mousedown", "wheel", "dblclick", "contextmenu"]) {
    root.addEventListener(type, (event) => {
      if (event.target === canvas && type === "contextmenu") return;
      event.stopPropagation();
    }, type === "wheel" ? { passive: false } : undefined);
  }
  rows.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });

  const originalConfigure = node.onConfigure;
  node.onConfigure = function () {
    const out = originalConfigure?.apply(this, arguments);
    restorePixelTarget();
    restoreCaptionHeight();
    inspectorResizeTarget = null;
    // Guides live on node.properties, which LiteGraph restores just before onConfigure.
    S.guides = loadGuides();
    syncGuideButtons();
    S.inspector = null;
    try {
      const { w, h } = liveSize();
      S.state = normalizeState(W.data.value, w, h);
      if (S.state.base_width !== w || S.state.base_height !== h) {
        const mode = syncMode();
        syncReferenceSize(S.state, w, h, mode);
        S.state.boxes = S.state.boxes.map((box) => {
          const next = syncBoxAspectRatio(box, S.state.base_width, S.state.base_height, w, h, mode);
          return { ...box, ...next };
        });
        S.state.base_width = w;
        S.state.base_height = h;
        commit();
      }
      S.sel = null;
      setTimeout(() => {
        applyLanguage();
        applyLayout(true);
        rebuildRows();
        draw();
        updateFoot();
        requestAnimationFrame(() => { applyLayout(true); draw(); });
      }, 0);
    } catch (err) {
      console.error("[VM MOSS] restore failed", err);
    }
    return out;
  };

  const originalResize = node.onResize;
  node.onResize = function () {
    const out = originalResize?.apply(this, arguments);
    requestAnimationFrame(() => {
      host.style.height = `${canvasHeight(liveSize().w, liveSize().h)}px`;
      fitCanvas();
    });
    return out;
  };

  // Space + left drag pans too (trackpads without a middle button).
  const onSpaceKey = (event) => {
    if (event.key !== " ") return;
    // Release must be handled even after the pointer/focus leaves the canvas.
    if (event.type === "keyup") {
      if (!S.space) return;
      S.space = false;
      event.stopPropagation();
      if (!S.pan) canvas.style.cursor = "crosshair";
      return;
    }
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return;
    if (!S.inside && document.activeElement !== canvas) return;
    S.space = true;
    event.preventDefault();
    event.stopPropagation();
    if (!S.pan) canvas.style.cursor = "grab";
  };
  // The Node test harness has no window event bus, so bind defensively.
  const keyTarget = typeof window.addEventListener === "function" ? window : null;
  const onViewBlur = () => {
    S.space = false;
    S.inside = false;
    if (S.pan) {
      try { canvas.releasePointerCapture(S.pan.pointerId); } catch (err) { /* capture already lost */ }
      endPan();
    }
    canvas.style.cursor = "crosshair";
  };
  keyTarget?.addEventListener("keydown", onSpaceKey, { capture: true });
  keyTarget?.addEventListener("keyup", onSpaceKey, { capture: true });
  keyTarget?.addEventListener("blur", onViewBlur);

  // V2.2: `I` opens the canvas eyedropper, `Esc` always closes it — both must
  // work when focus sits on a sibling widget rather than the canvas itself.
  const onEyeKey = (event) => {
    if (event.key === "Escape" && S.eye) {
      event.preventDefault();
      event.stopPropagation();
      exitEyedropper();
      return;
    }
    if (event.type !== "keydown") return;
    if (event.key !== "i" && event.key !== "I") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return;
    if (!S.inside && document.activeElement !== canvas) return;
    event.preventDefault();
    event.stopPropagation();
    enterEyedropper();
  };
  keyTarget?.addEventListener("keydown", onEyeKey, { capture: true });

  // Right-click is the documented second way out of the eyedropper.
  const onEyeContextMenu = (event) => {
    if (!S.eye) return;
    event.preventDefault();
    event.stopPropagation();
    exitEyedropper();
  };
  canvas.addEventListener("contextmenu", onEyeContextMenu);
  // ComfyUI 1.57 zooms the graph from a *capture* wheel handler on an ancestor of
  // the node DOM, so a listener on our canvas never fires. Intercept at window
  // capture level: swallow the event for our subtree, zoom only over the canvas.
  const onWheelCapture = (event) => {
    const target = event.target;
    const inPopover = S.pop?.el ? S.pop.el.contains(target) : false;
    if (!root.contains(target) && !inPopover) return;
    event.stopImmediatePropagation();
    if (target !== canvas) return;        // palette bar / rows keep native scrolling
    event.preventDefault();
    applyWheelZoom(event);
  };
  keyTarget?.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });

  // ComfyUI re-dispatches pointerdown to the graph canvas when a DOM widget does
  // not claim it, which steals the middle-button pan. Claim it at window capture.
  const onPointerDownCapture = (event) => {
    if (event.target !== canvas) return;
    event.stopImmediatePropagation();
    beginCanvasPointer(event);
  };
  keyTarget?.addEventListener("pointerdown", onPointerDownCapture, { capture: true });

  // Moves/ups during a pan are retargeted by the host, so drive them from window
  // capture as well; this keeps the pan smooth and never pans the graph.
  const onPanMoveCapture = (event) => {
    if (!S.pan) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    applyPan(event);
  };
  const onPanUpCapture = (event) => {
    if (!S.pan) return;
    event.stopImmediatePropagation();
    try { canvas.releasePointerCapture(event.pointerId); } catch (err) { /* already released */ }
    endPan();
  };
  keyTarget?.addEventListener("pointermove", onPanMoveCapture, { capture: true });
  keyTarget?.addEventListener("pointerup", onPanUpCapture, { capture: true });
  keyTarget?.addEventListener("pointercancel", onPanUpCapture, { capture: true });

  const originalRemoved = node.onRemoved;
  node.onRemoved = function () {
    autocomplete.clear();
    observer?.disconnect();
    captionObserver?.disconnect();
    inspectorObserver?.disconnect();
    window.removeEventListener("pointerup", endInspectorResize, { capture: true });
    window.removeEventListener("pointercancel", endInspectorResize, { capture: true });
    captionElement?.removeEventListener("pointerdown", beginCaptionResize);
    window.removeEventListener("pointerup", endCaptionResize, { capture: true });
    window.removeEventListener("pointercancel", endCaptionResize, { capture: true });
    closeModal();
    closePalettePop();
    if (palHintTimer) { clearTimeout(palHintTimer); palHintTimer = 0; }
    S.eye = null;
    keyTarget?.removeEventListener("keydown", onSpaceKey, { capture: true });
    keyTarget?.removeEventListener("keyup", onSpaceKey, { capture: true });
    keyTarget?.removeEventListener("blur", onViewBlur);
    keyTarget?.removeEventListener("keydown", onEyeKey, { capture: true });
    keyTarget?.removeEventListener("wheel", onWheelCapture, { capture: true });
    keyTarget?.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
    keyTarget?.removeEventListener("pointermove", onPanMoveCapture, { capture: true });
    keyTarget?.removeEventListener("pointerup", onPanUpCapture, { capture: true });
    keyTarget?.removeEventListener("pointercancel", onPanUpCapture, { capture: true });
    return originalRemoved?.apply(this, arguments);
  };

  const originalExecuted = node.onExecuted;
  node.onExecuted = function (message) {
    const out = originalExecuted?.apply(this, arguments);
    try {
      handleExecuted(message);
    } catch (err) {
      console.error("[VM MOSS] onExecuted failed", err);
    }
    return out;
  };

  function handleExecuted(message) {
    const size = message?.resolved_size?.[0];
    const synced = message?.synced_layout_data?.[0];
    const captionOnly = message?.synced_caption?.[0];
    if (message?.ref_info) {
      const refInput = node.inputs?.find((input) => input.name === "ref_image");
      // An older queued run may finish after the user disconnects its image.
      setRef(refInput && refInput.link == null ? null : message.ref_info[0]);
    }
    if (captionOnly !== undefined && captionOnly !== W.caption?.value) {
      setWidgetValue(W.caption, captionOnly);
      S.state.caption = captionOnly;
      commit();
      updateFoot();
    }

    if (synced) {
      S.state = normalizeState(synced, size?.[0] || liveSize().w, size?.[1] || liveSize().h);
      applyImportedWidgets(S.state);
      commit();
      applyLayout(true);
      rebuildRows();
      renderPaletteBar();
      draw();
      updateFoot();
    } else if (size && (size[0] !== liveSize().w || size[1] !== liveSize().h)) {
      // F04: the backend resolved a different size (linked width/height).
      setWidgetValue(W.preset, PRESET_CUSTOM);
      setWidgetValue(W.width, size[0]);
      setWidgetValue(W.height, size[1]);
      onSizeChanged();
    }
  }

  function applyImportedWidgets(state) {
    if (state.caption !== undefined) setWidgetValue(W.caption, state.caption);
    if (Array.isArray(state.meta)) {
      const options = W.meta?.options?.values || [];
      const first = state.meta.find((tag) => options.includes(tag));
      const rest = state.meta.filter((tag) => tag !== first);
      if (first) setWidgetValue(W.meta, first);
      else if (W.meta) setWidgetValue(W.meta, META_NONE);
      setWidgetValue(W.customTags, rest.join(", "));
    }
    if (state.canvas && W.canvas?.options?.values?.includes(state.canvas)) {
      setWidgetValue(W.canvas, state.canvas);
    }
    const { w, h } = liveSize();
    if (w !== state.base_width || h !== state.base_height) {
      setWidgetValue(W.preset, PRESET_CUSTOM);
    }
    setWidgetValue(W.width, state.base_width);
    setWidgetValue(W.height, state.base_height);
  }

  // --- boot --------------------------------------------------------
  const start = () => {
    const { w, h } = liveSize();
    S.state = normalizeState(W.data.value, w, h);
    S.state.base_width = w;
    S.state.base_height = h;
    restoreCaptionHeight();
    applyLanguage();
    node.setSize([Math.max(node.size?.[0] || 420, 520), node.size?.[1] || 300]);
    applyLayout(true);
    rebuildRows();
    draw();
    updateFoot();
    requestAnimationFrame(() => { applyLayout(true); draw(); });
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => fitCanvas());
      observer.observe(host);
      inspectorObserver = new ResizeObserver(() => {
        if (!inspector.classList.contains("show")) return;
        syncInspectorHeight();
        applyLayout(true);
      });
      inspectorObserver.observe(inspector);
      if (captionElement) {
        captionObserver = new ResizeObserver(syncCaptionHeight);
        captionObserver.observe(captionElement);
      }
    }
  };
  requestAnimationFrame(start);

  node._vmmoss = {
    S, commit, draw, rebuildRows, updateFoot, applyLayout, liveSize, t,
    resetView, renderZoomBadge, renderPaletteBar, openPalettePop, closePalettePop, syncToggleAll,
    renderRefBar,
    // V2.3
    toggleGuide, syncGuideButtons, saveGuides, loadGuides,
    openInspector, closeInspector, toggleInspector, renderInspector,
    // V2.2
    enterEyedropper, exitEyedropper, pickAtPointer, requestPick, commitPickedColor,
    pickTargetFor, samplePixel, extractPaletteFromRef, sampleRefPixels, setGlobalPalette,
  };
}

const LANG_LABELS = {
  zh: {
    language: "界面语言", preset: "尺寸预设", width: "宽 W", height: "高 H",
    sync: "比例同步", meta: "体裁先验", canvas: "画布结构", order: "图层排序",
    caption: "全局描述", externalMode: "外部同步方式", customTags: "自定义 meta 标签",
  },
  en: {
    language: "UI Language", preset: "Size Preset", width: "Width", height: "Height",
    sync: "Aspect Sync", meta: "Medium / Genre", canvas: "Canvas Structure", order: "Layer Order",
    caption: "Global Caption", externalMode: "External Sync", customTags: "Custom Meta Tags",
  },
};

if (app?.registerExtension) {
  app.registerExtension({
    name: "VividMuse.MOSSLayoutStudio",
    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData?.name !== NODE_ID) return;
      const created = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const out = created?.apply(this, arguments);
        try { setup(this); } catch (err) { console.error("[VM MOSS] init failed", err); }
        return out;
      };
    },
  });
}
