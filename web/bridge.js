import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { routeUnified } from "./unified.js";

const SHELL = "VMImageEditBridge";
const RESIZE = "VMImageResizeAlign";
const PREFIX_PLAN = "vm15p_";
const PREFIX_FINISH = "vm15f_";

const I18N = {
  zh: {
    title: "VM 图像编辑", language: "语言 / Language", auto: "自动", chinese: "中文", english: "English",
    prompt: "编辑需求", selection_mode: "选区方式", run_mode: "执行方式", filename_prefix: "保存路径",
    seam_harmonization: "接缝协调", off: "关闭", seam_auto: "自动",
    seam_applied: "已尝试局部协调，请查看接缝", seam_skipped: "本次未改变结果",
    full_image: "整图编辑（无需遮罩）", full_help: "无需编辑遮罩；整图可能产生细微变化",
    full_preview: "上次运行：允许整图调整 · 不代表实际变化 · 蓝色为硬保护",
    full_seam: "接缝协调（整图模式不适用）",
    warning_full_image_protection: "整图硬保护会重新引入拼接边界",
    seam_harmonization_help: "仅尝试减轻部分边缘色差，可能没有明显变化；新露出的区域仍可能不一致。",
    image: "主图", edit_mask: "编辑遮罩", sam_model: "SAM 模型", sam_clip: "SAM CLIP",
    protect_mask: "保护遮罩", image_context: "尺寸上下文", generated_pre: "生成 Pre",
    padded_image: "工作图", noise_mask: "噪声遮罩", edit_prompt: "原始需求",
    guide_image: "标注参考图", generation_prompt: "标注生成需求",
    guidance_ready: "标注参考已连接 Qwen", guidance_plain: "普通编辑 · 标注参考未接入 Qwen",
    preview_image: "范围预览", allowed_mask: "允许区遮罩", final_image: "Final",
    auto_target: "细化到物体", drawn_mask: "严格按所画遮罩", coarse_region: "按粗选范围", generate: "直接生成", preview: "仅预览范围",
    show_preview: "展开预览", hide_preview: "收起预览", preview_legend: "绿色可编辑 · 蓝色保护",
    show_advanced: "可选功能", hide_advanced: "收起可选功能",
    reference_mode: "参考方式", ref_none: "不使用参考", ref_content: "内容参考图", ref_mask: "遮罩引导（实验）",
    use_protection: "启用保护遮罩", unified_plain: "画范围、写需求即可运行；也可先预览范围",
    protection_on: "硬保护已启用", optional_help: "启用后，在下方对应的加载图像节点选择图片。",
    last_preview: "上次运行的范围预览 · 绿色可编辑 · 蓝色保护", last_final: "上次运行的 Final · 临时预览",
    save_unconnected: "Final 未连接；保存请接“保存图像”",
    save_downstream: "文件由下游保存节点写入；此处仅临时预览",
    save_help: "保存图片：将 Final 接到“保存图像”，在那里设置文件名前缀。仅预览范围不会输出 Final；旧工作流也需接上保存节点。",
    stale_result: "输入已变化，请重新运行", no_result: "尚无运行结果",
    protection_warning: "保护提示：", protection_check: "；请检查范围", warning_hand: "未检出手",
    warning_semantic_protection: "文字保护仅作生成提示，硬保护以保护遮罩为准",
    warning_face: "脸", warning_hair: "头发", warning_dog: "狗", warning_text_protection: "未解析的文字保护（可连接保护遮罩）",
    missing_inputs: "请连接主图和编辑遮罩。",
    prompt_help: "完整描述编辑需求，无需固定物品名称或句式。", selection_mode_help: "粗选范围填充可靠闭合圈，不需要 SAM；细化到物体使用 SAM；严格模式仅使用实际白色笔迹。标注参考图与标注生成需求接入 Qwen 后才启用视觉引导。",
    run_mode_help: "仅预览范围不会请求生成 Pre，也不会向 Final 输出图片。", filename_prefix_help: "旧版兼容字段，已停用；请在外接“保存图像”节点设置文件名前缀。",
    vm_language_help: "自动跟随 ComfyUI 当前语言，只影响此节点。",
    resize_title: "VM 图像缩放与对齐", resize_mode: "缩放方式", target_size: "目标尺寸",
    interpolation: "图像插值", divisible_by: "尺寸整除", size_info: "尺寸信息",
    keep: "保持原尺寸", long: "按长边", width: "按宽度", height: "按高度",
    resize_image: "图像", resize_edit_mask: "编辑遮罩", resize_protect_mask: "保护遮罩",
    resize_context: "尺寸上下文", no_size_info: "尚无运行尺寸",
    last_size_info: "上次运行尺寸", size_stale: "参数已变化，请重新运行",
    divisible_by_help: "1 表示不对齐。当前 Qwen 编辑链要求宽高为 32 的倍数；本节点保留通用整除选项。",
    interpolation_help: "仅缩放图像时生效；硬遮罩使用独立处理规则。",
    target_size_help: "按长边、宽度或高度缩放时使用。",
    padded_image_help: "生成工作图。连接尺寸上下文时复用外部画布，否则按所选模型要求向右下补边。",
  },
  en: {
    title: "VM Image Edit", language: "语言 / Language", auto: "Auto", chinese: "中文", english: "English",
    prompt: "Edit request", selection_mode: "Selection", run_mode: "Run mode", filename_prefix: "Save prefix",
    seam_harmonization: "Seam harmonization", off: "Off", seam_auto: "Auto",
    seam_applied: "Local correction applied; check the seam", seam_skipped: "No change applied",
    full_image: "Full-image edit (no mask)", full_help: "No edit mask needed; subtle changes may occur across the image",
    full_preview: "Last run: whole image editable, not actual changes · Blue: hard protection",
    full_seam: "Seam harmonization (not used for full image)",
    warning_full_image_protection: "Full-image hard protection reintroduces compositing boundaries",
    seam_harmonization_help: "May reduce some boundary color differences. The effect may be subtle, and newly revealed areas may remain inconsistent.",
    image: "Main image", edit_mask: "Edit mask", sam_model: "SAM model", sam_clip: "SAM CLIP",
    protect_mask: "Protect mask", image_context: "Size context", generated_pre: "Generated Pre",
    padded_image: "Working image", noise_mask: "Noise mask", edit_prompt: "Original request",
    guide_image: "Annotation reference", generation_prompt: "Guided prompt",
    guidance_ready: "Annotation reference connected to Qwen", guidance_plain: "Standard edit · annotation reference not connected to Qwen",
    preview_image: "Range preview", allowed_mask: "Allowed mask", final_image: "Final",
    auto_target: "Refine to object", drawn_mask: "Strict drawn mask", coarse_region: "Coarse region", generate: "Generate", preview: "Preview range only",
    show_preview: "Show preview", hide_preview: "Hide preview", preview_legend: "Green: editable · Blue: protected",
    show_advanced: "Optional features", hide_advanced: "Hide optional features",
    reference_mode: "Reference mode", ref_none: "No reference", ref_content: "Content reference", ref_mask: "Mask guidance (experimental)",
    use_protection: "Use protection mask", unified_plain: "Draw a region and describe the edit; preview is optional",
    protection_on: "Hard protection enabled", optional_help: "When enabled, select the image in the matching loader below.",
    last_preview: "Last run: range preview · Green: editable · Blue: protected", last_final: "Last run: Final · temporary preview",
    save_unconnected: "Final is unconnected; connect Save Image to save",
    save_downstream: "Files are written by downstream save nodes; this is a temporary preview",
    save_help: "To save, connect Final to Save Image and set the filename prefix there. Preview range only emits no Final image. Older workflows also need a save node.",
    stale_result: "Inputs changed; run again", no_result: "No result yet",
    protection_warning: "Protection note: ", protection_check: "; check the range",
    warning_semantic_protection: "Text protection guides generation; hard protection comes from the protect mask",
    warning_hand: "hand", warning_face: "face", warning_hair: "hair", warning_dog: "dog", warning_text_protection: "unparsed text protection (connect a protect mask)",
    missing_inputs: "Connect the main image and edit mask.",
    prompt_help: "Describe the complete edit; no fixed object names or sentence pattern required.", selection_mode_help: "Coarse region fills reliable outlines without SAM; refine to object uses SAM; strict mode uses actual painted pixels. Connect the annotation reference and guided prompt to Qwen to enable visual guidance.",
    run_mode_help: "Preview range only requests no generated Pre and emits no Final image.", filename_prefix_help: "Inactive compatibility field. Set the filename prefix on an external Save Image node.",
    vm_language_help: "Auto follows ComfyUI's current language for this node.",
    resize_title: "VM Image Resize & Align", resize_mode: "Resize mode", target_size: "Target size",
    interpolation: "Image interpolation", divisible_by: "Divisible by", size_info: "Size info",
    keep: "Keep original size", long: "Longest edge", width: "Width", height: "Height",
    resize_image: "Image", resize_edit_mask: "Edit mask", resize_protect_mask: "Protect mask",
    resize_context: "Size context", no_size_info: "No run size yet",
    last_size_info: "Last run size", size_stale: "Parameters changed; run again",
    divisible_by_help: "1 means no alignment. The Qwen edit chain requires dimensions divisible by 32; this resize node retains generic alignment options.",
    interpolation_help: "Used only when resizing the image; hard masks follow separate rules.",
    target_size_help: "Used when resizing by longest edge, width, or height.",
    padded_image_help: "Generation canvas. Reuses the connected size context, or pads right and bottom to the selected model's alignment.",
  },
};

const ERRORS = {
  VMN_PERSON_UNCONFIRMED: {zh:"独立检测未确认人物，无法核实 SAM 候选。可主动改用按粗选范围。", en:"Independent detection did not confirm a person. The SAM candidate remains unverified. You can explicitly select Coarse region."},
  VMN_PERSON_MASK_DATA: {zh:"人物检测数据无效或缺少实例遮罩，自动细化已停止。", en:"Person detection returned invalid data or no instance mask. Automatic refinement stopped."},
  VMN_PERSON_MASK_SIZE: {zh:"人物实例遮罩尺寸与输入图像不一致，自动细化已停止。", en:"The person mask size does not match the input image. Automatic refinement stopped."},
  VMN_PERSON_CONFLICT: {zh:"SAM 与独立人物检测不一致，请预览范围或主动改用按粗选范围。", en:"SAM and independent person detection disagree. Preview the selection or explicitly select Coarse region."},
  VMN_PERSON_MODEL_REQUIRED: {zh:"缺少人物独立校验模型，请按模型清单安装或改用按粗选范围。", en:"The independent person-check model is missing. Install it from the model list or select Coarse region."},
  VMN_BACKEND_REMOVED: {zh:"Klein 已从当前版本撤除，请导入新版 Qwen 工作流。", en:"Klein has been removed. Import the current Qwen workflow."},
  VMN_LEGACY_BRANCH_USED: {zh:"旧 Klein 分支仍有独立输出或共享消费者，请使用新版 Qwen 工作流或自行处理旧分支。", en:"The old Klein branch still has an output or shared consumer. Use the current Qwen workflow or resolve that branch manually."},
  VMN_BACKEND_UNKNOWN: {zh:"未识别模型适配，请使用已验证的工作流。", en:"Unknown backend. Use a verified workflow."},

  VMN_FULL_MASK_GUIDANCE: { zh: "整图编辑请将参考方式改为不使用参考或内容参考图。", en: "Full-image edit requires No reference or Content reference, not Mask guidance." },
  VMN_FULL_GENERATION_CHAIN: { zh: "整图自动路由需要本编辑器独立的标准生成链，且编码分辨率为 0；请检查共享采样器、接线或改用手工工作流。", en: "Full-image routing needs a dedicated standard generation chain and encoder resolution 0. Check shared samplers/connections or use a manual workflow." },
  VMN_COMPOSITE_FAILED: { zh: "回贴处理失败，请查看具体错误信息。", en: "Compositing failed. Check the error details." },
  VMN_SHARED_PROTECTION: { zh: "共享缩放节点的编辑节点需要相同保护设置；不同设置请分别使用缩放节点。", en: "Editors sharing a resize node need the same protection setting. Use separate resize nodes for different settings." },
  VMN_PROTECT_INPUT: { zh: "保护遮罩已启用，请检查保护图到缩放及编辑节点的连线。", en: "Protection is enabled. Check the protection image connections to the resize and edit nodes." },
  VMN_REFERENCE_INPUT: { zh: "内容参考已启用，请检查当前模型生成链的参考图输入。", en: "Content reference is enabled. Check the reference image input of the selected generation chain." },
  VMN_UNIFIED_ENCODER: { zh: "统一工作流需要一个与本编辑节点工作图直连的 Qwen 编码节点。", en: "The unified workflow needs one Qwen encoder connected directly to this editor's working image." },
  VMN_REFERENCE_MODE: { zh: "参考方式无效，请重新选择。", en: "Select a valid reference mode." },
  VMN_REGION_OPEN: { zh: "圈选没有形成可靠范围；请闭合轮廓、填涂区域，或使用严格按所画遮罩。", en: "The marks do not form a reliable region. Close the outline, fill the area, or use strict drawn mask." },
  VMN_TARGET_INCOMPLETE: { zh: "自动选区只覆盖粗选中的很小局部；请改用按粗选范围，或调整轮廓后预览。", en: "The automatic mask covers only a small fragment. Use coarse region, or adjust the outline and preview." },
  VMN_EMPTY_MASK: { zh: "编辑遮罩为空，请在目标内部画几笔或填满修补区域。", en: "The edit mask is empty. Paint inside the target or fill the repair area." },
  VMN_MASK_MISMATCH: { zh: "图像和遮罩尺寸不一致，请从同一张图像连接遮罩。", en: "The image and edit mask have different dimensions. Connect a mask from the same image." },
  VMN_CONTEXT_MISMATCH: { zh: "尺寸上下文与图像不匹配，请重新连接同一个缩放节点的输出。", en: "The size context does not match the image. Reconnect outputs from the same resize node." },
  VMN_SAM_REQUIRED: { zh: "自动选中目标需要连接 SAM3 模型。", en: "Connect a SAM3 model to select a target automatically." },
  VMN_EMPTY_SCOPE: { zh: "有效编辑范围为空，请调整编辑遮罩或保护遮罩。", en: "The editable area is empty. Adjust the edit or protection mask." },
  VMN_SELECTION_FAILED: { zh: "编辑范围规划失败，请检查遮罩和编辑需求。", en: "Range planning failed. Check the mask and edit request." },
  VMN_TARGET_NO_MATCH: { zh: "笔迹未可靠指向目标；请闭合轮廓或在目标内部补画几笔。", en: "The marks do not identify a target reliably. Close the outline or add a few marks inside the target." },
  VMN_TARGET_AMBIGUOUS: { zh: "笔迹指向多个目标；请只圈出或涂抹一个目标。", en: "The marks point to multiple targets. Mark only one target." },
  VMN_PROTECTION_UNVERIFIED: { zh: "保护对象未核实，请检查图像与保护要求。", en: "The protected subject could not be verified. Check the image and request." },
  VMN_TARGET_DESCRIPTION: { zh: "未识别该编辑目标；可使用所画遮罩，或描述需要改色的物体。", en: "Unrecognized edit target. Use the drawn mask, or describe an object to recolor." },
  VMN_TARGET_NOT_FOUND: { zh: "未能确认所画位置的目标；请调整圈选范围，或使用所画遮罩并检查范围。", en: "Could not identify the target at the marked location. Adjust the outline, or use and review the drawn mask." },
  VMN_EMPTY_PROMPT: { zh: "请填写编辑需求。", en: "Enter an edit request." },
  VMN_SPATIAL_EXTENT: { zh: "无法仅凭这段笔迹确定物体范围；请粗略圈出目标轮廓后预览。", en: "These marks do not establish the object extent. Roughly outline the target and preview the range." },
  VMN_PROTECTION_CONFLICT: { zh: "保护区与编辑目标大面积重叠，请检查遮罩。", en: "The protection area overlaps the edit target substantially. Check the masks." },
  VMN_PRE_MISMATCH: { zh: "生成 Pre 的尺寸与工作画布不一致，已停止回贴。", en: "The generated Pre has the wrong dimensions; compositing was stopped." },
  VMN_PRE_MISSING: { zh: "生成分支没有返回 Pre，请检查外部解码节点连线。", en: "The generation chain did not return Pre. Check the external decoder connection." },
  VMN_QWEN_ALIGNMENT: { zh: "外部画布不满足当前 Qwen 编辑链的 32 倍数要求，请调整缩放节点的尺寸整除。", en: "The external canvas is not aligned for this Qwen edit chain. Adjust the resize node so both dimensions are divisible by 32." },
  VMN_CONTEXT_EDIT: { zh: "编辑遮罩与尺寸上下文不匹配，请先在原图画遮罩，再连接同一个缩放节点的输出。", en: "The edit mask does not match the size context. Paint on the original image, then connect the outputs of the same resize node." },
  VMN_CONTEXT_PROTECT: { zh: "保护遮罩与尺寸上下文不匹配，请连接同一个缩放节点的输出。", en: "The protection mask does not match the size context. Connect outputs from the same resize node." },
  VMN_CANVAS_LIMIT: { zh: "输出画布尺寸或总像素超出限制，请降低目标尺寸。", en: "The output canvas exceeds the size or pixel limit. Reduce the target size." },
  VMN_MASK_INVALID: { zh: "遮罩值无效，请检查上游遮罩节点。", en: "The mask contains invalid values. Check the upstream mask node." },
  VMN_RESIZE_INPUT: { zh: "缩放节点只接受单张有效图像。", en: "The resize node needs one valid image." },
};

function comfyLanguage() {
  let locale;
  try { locale = app.ui?.settings?.getSettingValue("Comfy.Locale"); } catch { /* no frontend settings yet */ }
  return typeof locale === "string" && locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function actualLanguage(node) {
  const choice = node.properties?.vm_language || "auto";
  return choice === "auto" ? comfyLanguage() : choice === "zh" ? "zh" : "en";
}

function languageChoice(value) {
  if (value === "zh" || value === "中文") return "zh";
  if (value === "en" || value === "English") return "en";
  return "auto";
}

function modeChoice(value, kind) {
  const zh = I18N.zh, en = I18N.en;
  if (kind === "seam_harmonization") {
    if (value == null) return "off";
    if (["off", zh.off, en.off].includes(value)) return "off";
    if (["auto", zh.seam_auto, en.seam_auto].includes(value)) return "auto";
    return value; // Preserve unknown values so compilation rejects them explicitly.
  }
  if (kind === "selection_mode") {
    const aliases = {"自动选中目标": "auto_target", "Select target": "auto_target", "使用所画遮罩": "drawn_mask", "Use drawn mask": "drawn_mask"};
    if (aliases[value]) return aliases[value];
  }
  const options = kind === "selection_mode" ? ["auto_target", "drawn_mask", "coarse_region", "full_image"] : ["generate", "preview"];
  for (const key of options) if (value === key || value === zh[key] || value === en[key]) return key;
  return kind === "selection_mode" ? "coarse_region" : options[0];
}

function uiText(value) {
  return Array.isArray(value) ? value.join("") : String(value ?? "");
}

const RESIZE_MODES = {
  "保持原尺寸": "keep", "按长边": "long", "按宽度": "width", "按高度": "height",
};

function resizeMode(value) {
  if (RESIZE_MODES[value]) return value;
  for (const [stored, key] of Object.entries(RESIZE_MODES)) {
    if (value === I18N.zh[key] || value === I18N.en[key]) return stored;
  }
  return "保持原尺寸";
}

function outputGraph(value) {
  if (!value || typeof value !== "object") return null;
  if (value.output && typeof value.output === "object") return value.output;
  if (value.prompt && typeof value.prompt === "object") return value.prompt;
  return Object.values(value).some(item => item?.class_type === "VMEditFinish") ? value : null;
}

function promptSignature(output) {
  const clone = JSON.parse(JSON.stringify(output));
  for (const item of Object.values(clone)) {
    if (item?.inputs) delete item.inputs.frontend_session;
  }
  return JSON.stringify(clone);
}

function resizeSignature(output, id) {
  const dependencies = {};
  const visit = key => {
    key = String(key);
    if (dependencies[key] || !output[key]) return;
    dependencies[key] = output[key];
    for (const value of Object.values(output[key].inputs || {})) {
      if (Array.isArray(value) && value.length === 2 && output[value[0]]) visit(value[0]);
    }
  };
  visit(id);
  return promptSignature(Object.fromEntries(Object.keys(dependencies).sort().map(key => [key, dependencies[key]])));
}

async function applyResizeResult(node, detail) {
  const promptId = detail?.prompt_id;
  if (!promptId || !detail.output?.vm_size_info) return;
  const entry = [...node.vmResizeSubmissions].find(([, state]) => state.promptId === promptId);
  if (!entry) {
    // A very fast or cached result can arrive before POST /prompt returns.
    if ([...node.vmResizeSubmissions.values()].some(state => state.promptId === null)) {
      node.vmResizePendingResults.set(promptId, detail);
      if (node.vmResizePendingResults.size > 20) node.vmResizePendingResults.delete(node.vmResizePendingResults.keys().next().value);
    }
    return;
  }
  const [token, state] = entry;
  let signature;
  try { signature = resizeSignature((await app.graphToPrompt()).output, node.id); }
  catch { signature = null; }
  const current = app.graph?.getNodeById(node.id);
  if (current !== node || state.sequence < node.vmResizeAppliedSequence) return;
  node.vmResizeAppliedSequence = state.sequence;
  node.vmSizeInfo = uiText(detail.output.vm_size_info);
  node.vmSizeStale = node.vmResizeLatestSubmission !== token ||
    state.revision !== node.vmResizeRevision || signature !== state.signature;
  translateResizeNode(node);
}

function modeInput(value, property, kind, connected) {
  if (connected) return Array.isArray(value) && value.length === 2 ? value : modeChoice(value, kind);
  return modeChoice(property ?? value, kind);
}

function markResultStale(node) {
  node.vmInputRevision = (node.vmInputRevision || 0) + 1;
  updateGuidanceStatus(node);
  if (!node.vmPreviewStage && !node.vmLatestSubmission) return;
  node.vmResultStale = true;
  translateNode(node);
}

function updateGuidanceStatus(node) {
  if (!node.vmGuidanceStatus) return;
  const graph = app.graph, t = I18N[actualLanguage(node)];
  const saving = node.outputs?.[5]?.links?.length ? t.save_downstream : t.save_unconnected;
  const show = message => {
    node.vmGuidanceStatus.textContent = `${saving} · ${message}`;
    node.vmGuidanceStatus.title = `${t.save_help}\n${message}`;
  };
  if (node.properties?.vm_unified) {
    const notes = [];
    if (node.properties.vm_selection === "full_image") notes.push(t.full_help);
    if (node.properties.vm_reference_mode === "content") notes.push(t.ref_content);
    if (node.properties.vm_reference_mode === "mask") notes.push(t.ref_mask);
    if (node.properties.vm_use_protection) notes.push(t.protection_on);
    show(notes.join(" · ") || t.unified_plain);
    return;
  }
  const getLink = id => graph?.links?.[id] || graph?.links?.get?.(id);
  const fromSlot = (target, name, slot) => {
    const link = getLink(target.inputs?.find(input => input.name === name)?.link);
    return link && String(link.origin_id) === String(node.id) && link.origin_slot === slot;
  };
  const connected = (node.outputs?.[6]?.links || []).some(id => {
    const link = getLink(id), target = graph?.getNodeById(link?.target_id);
    return target?.type === "TextEncodeQwenImage21" && fromSlot(target, "images.image_1", 0) &&
      fromSlot(target, "images.image_2", 6) && fromSlot(target, "prompt", 7);
  });
  show(node.properties.vm_selection === "full_image" ? t.full_help : connected ? t.guidance_ready : t.guidance_plain);
}

function nodes2Enabled() {
  try { return app.ui?.settings?.getSettingValue("Comfy.VueNodes.Enabled") === true; }
  catch { return false; }
}

function setWidgetHidden(node, widget, hidden) {
  if (!widget) return;
  widget.options ||= {};
  const changed = widget.hidden !== hidden || widget.options.hidden !== hidden;
  widget.hidden = hidden;
  widget.options.hidden = hidden;
  if (changed && nodes2Enabled() && Array.isArray(node.widgets)) {
    // Nodes 2.0 tracks the widget array, while the classic canvas reads widget.hidden.
    node.widgets.push({ name: "vm_visibility_refresh", type: "hidden", hidden: true,
      options: { hidden: true, serialize: false } });
    node.widgets.pop();
  }
}

function applyAdvancedVisibility(node) {
  const prefix = node.widgets?.find(w => w.name === "filename_prefix");
  const toggle = node.widgets?.find(w => w.name === "vm_advanced_toggle");
  if (!prefix || !toggle) return;
  const unified = node.properties.vm_unified === true;
  // Preserve the old serialized slot without offering an inactive save control.
  setWidgetHidden(node, prefix, true);
  setWidgetHidden(node, toggle, !unified);
  setWidgetHidden(node, node.widgets?.find(w => w.name === "vm_language"), false);
  node.vmLastNodes2 = nodes2Enabled();
  node.setDirtyCanvas?.(true, true);
}

// Optional content lives outside the canvas node, so opening it cannot resize
// the node or overlap adjacent nodes. Native dialogs also support keyboard use.
function createPanelDialog(node, content, kind) {
  const dialog = document.createElement("dialog");
  dialog.dataset.vmPanel = kind;
  dialog.style.cssText = "width:min(640px,90vw);max-height:85vh;overflow:auto;padding:12px;background:#252827;color:#ddd;border:1px solid #777;border-radius:8px;";
  const close = document.createElement("button");
  close.textContent = "×"; close.setAttribute("aria-label", "Close / 关闭");
  close.style.cssText = "float:right;font-size:22px;cursor:pointer;background:transparent;color:inherit;border:0;";
  close.onclick = () => dialog.close();
  content.style.display = "block";
  dialog.append(close, content);
  document.body.append(dialog);
  const property = kind === "preview" ? "vm_preview_expanded" : "vm_advanced_expanded";
  dialog.addEventListener("close", () => { if(kind!=="resize"){node.properties[property] = false; translateNode(node);} });
  const removed = node.onRemoved;
  node.onRemoved = function(...args) { dialog.remove(); return removed?.apply(this,args); };
  return dialog;
}

function togglePanel(node, dialog, property) {
  if (dialog.open) dialog.close();
  else { node.properties[property] = true; dialog.showModal(); }
  translateNode(node);
}

function translateNode(node) {
  if (!node?.properties) return;
  const t = I18N[actualLanguage(node)];
  if (node.vmReferenceSelect) {
    node.vmReferenceLabel.textContent = t.reference_mode;
    node.vmReferenceSelect.replaceChildren(...["none", "content", "mask"].map(value => new Option(t[`ref_${value}`], value)));
    node.vmReferenceSelect.value = node.properties.vm_reference_mode || "none";
    node.vmProtectCheck.checked = node.properties.vm_use_protection === true;
    node.vmProtectLabel.textContent = t.use_protection;
    node.vmOptionalHelp.textContent = t.optional_help;
  }

  updateGuidanceStatus(node);
  const prior = node.properties.vm_last_title;
  if (!node.title || node.title === prior || node.title === I18N.zh.title || node.title === I18N.en.title) {
    node.title = t.title;
  }
  node.properties.vm_last_title = t.title;
  for (const slot of node.inputs || []) slot.localized_name = t[slot.name] || slot.name;
  for (const slot of node.outputs || []) slot.localized_name = t[slot.name] || slot.name;
  for (const widget of node.widgets || []) {
    if (widget.name === "vm_language") {
      widget.label = t.language;
      widget.options.values = [t.auto, "中文", "English"];
      widget.value = node.properties.vm_language === "zh" ? "中文" : node.properties.vm_language === "en" ? "English" : t.auto;
    } else if (widget.name === "seam_harmonization") {
      widget.label = node.properties.vm_selection === "full_image" ? t.full_seam : t.seam_harmonization;
      widget.options.values = [t.off, t.seam_auto];
      widget.value = node.properties.vm_seam_harmonization === "off" ? t.off :
        node.properties.vm_seam_harmonization === "auto" ? t.seam_auto : node.properties.vm_seam_harmonization;
    } else if (widget.name === "selection_mode" || widget.name === "run_mode") {
      widget.label = t[widget.name];
      const values = widget.name === "selection_mode" ? ["coarse_region", "full_image", "auto_target", "drawn_mask"] : ["generate", "preview"];
      widget.options.values = values.map(value => t[value]);
      widget.value = t[node.properties[widget.name === "selection_mode" ? "vm_selection" : "vm_run"]];
    } else if (t[widget.name]) {
      widget.label = t[widget.name];
    } else if (widget.name === "vm_preview_toggle") {
      widget.label = node.properties.vm_preview_expanded ? t.hide_preview : t.show_preview;
    } else if (widget.name === "vm_advanced_toggle") {
      widget.label = node.properties.vm_advanced_expanded ? t.hide_advanced : t.show_advanced;
    }
    if (widget.options && t[`${widget.name}_help`]) widget.options.tooltip = t[`${widget.name}_help`];
  }
  if (node.vmPreviewLegend) {
    const caption = node.vmPreviewStage === "Final" ? t.last_final :
      node.vmPreviewStage === "Preview" ? (node.vmResultSelection === "full_image" ? t.full_preview : t.last_preview) : t.no_result;
    const seam = node.vmPreviewStage === "Final" ? ({ applied: t.seam_applied, skipped: t.seam_skipped }[node.vmSeamStatus] || "") : "";
    const resultCaption = seam ? `${caption} · ${seam}` : caption;
    node.vmPreviewLegend.textContent = node.vmResultStale ? `${resultCaption} · ${t.stale_result}` : resultCaption;
  }
  if (node.vmProtectionStatus) {
    const warnings = node.vmProtectionWarnings || [];
    node.vmProtectionStatus.style.display = warnings.length ? "block" : "none";
    node.vmProtectionStatus.textContent = warnings.length ?
      `⚠ ${t.protection_warning}${warnings.map(code => t[`warning_${code}`] || code).join(actualLanguage(node) === "zh" ? "、" : ", ")}${t.protection_check}${node.vmResultStale ? ` · ${t.stale_result}` : ""}` : "";
  }
  if (node.vmSaveHelp) node.vmSaveHelp.textContent = t.save_help;
  node.setDirtyCanvas?.(true, true);
}

function installNodeUI(node) {
  node.vmLiveSession = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
  node.vmSubmissions = new Map();
  node.vmInputRevision = 0;
  node.properties ||= {};
  node.properties.vm_language = languageChoice(node.properties.vm_language);
  node.properties.vm_selection = modeChoice(node.properties.vm_selection, "selection_mode");
  node.properties.vm_run = modeChoice(node.properties.vm_run, "run_mode");
  node.properties.vm_seam_harmonization = modeChoice(node.properties.vm_seam_harmonization, "seam_harmonization");
  node.properties.vm_canvas_policy ||= "external";
  node.properties.vm_preview_expanded ||= false;
  node.properties.vm_advanced_expanded ||= false;
  node.properties.vm_reference_mode ||= "none";
  node.properties.vm_use_protection ||= false;
  node.vmProtectionWarnings = [];

  const language = node.addWidget("combo", "vm_language", "auto", value => {
    node.properties.vm_language = languageChoice(value);
    translateNode(node);
  }, { values: ["自动", "中文", "English"] });
  language.serializeValue = () => node.properties.vm_language;

  for (const [name, property] of [["selection_mode", "vm_selection"], ["run_mode", "vm_run"], ["seam_harmonization", "vm_seam_harmonization"]]) {
    const widget = node.widgets?.find(w => w.name === name);
    if (!widget) continue;
    const prior = widget.callback;
    widget.callback = function(value, ...args) {
      node.properties[property] = modeChoice(value, name);
      prior?.call(this, value, ...args);
      if (name === "selection_mode") revealOptionalInputs(node);
      markResultStale(node);
      translateNode(node);
    };
    widget.serializeValue = () => node.properties[property];
  }

  const promptWidget = node.widgets?.find(w => w.name === "prompt");
  if (promptWidget) {
    const prior = promptWidget.callback;
    promptWidget.callback = function(value, ...args) {
      prior?.call(this, value, ...args);
      markResultStale(node);
    };
  }

  const status = document.createElement("div");
  status.classList.add("vmn-inline-panel");
  status.style.cssText = "box-sizing:border-box;width:100%;height:28px;overflow:auto;display:none;padding:5px 6px;color:#f4cf86;font:12px/18px sans-serif;";
  node.vmProtectionStatus = status;
  node.addDOMWidget("vm_protection_status", "vm_protection_status", status, {
    getMinHeight: () => 28,
    getMaxHeight: () => 28,
    serialize: false,
  });
  const guidance = document.createElement("div");
  guidance.classList.add("vmn-inline-panel");
  guidance.style.cssText = "box-sizing:border-box;width:100%;height:24px;overflow:auto;padding:3px 6px;color:#b8c8d0;font:12px/18px sans-serif;";
  node.vmGuidanceStatus = guidance;
  node.addDOMWidget("vm_guidance_status", "vm_guidance_status", guidance, {
    getMinHeight: () => 24, getMaxHeight: () => 24, serialize: false,
  });
  const optional = document.createElement("div");
  optional.classList.add("vmn-inline-panel");
  optional.style.cssText = "display:none;box-sizing:border-box;padding:8px;width:100%;background:#252827;color:#ddd;font:13px sans-serif;";
  optional.addEventListener("pointerdown", event => event.stopPropagation());
  const refLabel = document.createElement("label"), refSelect = document.createElement("select");
  refSelect.style.cssText = "width:100%;margin:4px 0 8px;padding:5px;background:#353535;color:#eee;border:1px solid #666;border-radius:4px;";
  refSelect.setAttribute("aria-label", "VM reference mode");
  const protectLabel = document.createElement("label"), check = document.createElement("input"), protectText = document.createElement("span");
  check.type = "checkbox"; check.setAttribute("aria-label", "VM protection mask");
  protectLabel.append(check, protectText);
  const help = document.createElement("div");help.style.cssText = "margin-top:7px;color:#b8c8d0;font-size:11px;";
  optional.append(refLabel, refSelect, protectLabel, help);
  refSelect.onchange = () => { node.properties.vm_reference_mode = refSelect.value; revealOptionalInputs(node); markResultStale(node); translateNode(node); };
  check.onchange = () => { node.properties.vm_use_protection = check.checked; revealOptionalInputs(node); markResultStale(node); translateNode(node); };
  node.vmOptionalPanel = optional; node.vmReferenceSelect = refSelect; node.vmReferenceLabel = refLabel;
  node.vmProtectCheck = check; node.vmProtectLabel = protectText; node.vmOptionalHelp = help;
  const saveHelp = document.createElement("div");
  saveHelp.style.cssText = "margin-top:10px;color:#b8c8d0;font-size:12px;";
  optional.append(saveHelp); node.vmSaveHelp = saveHelp;
  node.vmOptionalDialog = createPanelDialog(node, optional, "optional");
  const panel = document.createElement("div");
  panel.classList.add("vmn-inline-panel");
  panel.style.cssText = "box-sizing:border-box;width:100%;display:none;padding:6px;background:#252827;color:#ddd;font:12px sans-serif;";
  const legend = document.createElement("div");
  legend.style.cssText = "padding:0 0 5px 0;text-align:right;";
  const picture = document.createElement("img");
  picture.style.cssText = "display:block;max-width:100%;max-height:70vh;margin:auto;object-fit:contain;";
  panel.append(legend, picture);
  node.vmPreviewLegend = legend;
  node.vmPreviewImage = picture;
  node.vmPreviewPanel = panel;
  node.vmPreviewDialog = createPanelDialog(node, panel, "preview");
  node.addWidget("button", "vm_preview_toggle", "", () => {
    togglePanel(node, node.vmPreviewDialog, "vm_preview_expanded");
  }, { serialize: false });
  node.addWidget("button", "vm_advanced_toggle", "", () => {
    togglePanel(node, node.vmOptionalDialog, "vm_advanced_expanded");
  }, { serialize: false });
  applyAdvancedVisibility(node);
  translateNode(node);
}

function translateResizeNode(node) {
  if (!node?.properties) return;
  const t = I18N[actualLanguage(node)];
  const previous = node.properties.vm_last_title;
  if (!node.title || node.title === previous || node.title === I18N.zh.resize_title || node.title === I18N.en.resize_title) {
    node.title = t.resize_title;
  }
  node.properties.vm_last_title = t.resize_title;
  for (const input of node.inputs || []) input.localized_name = t[`resize_${input.name}`] || input.name;
  const outputs = [t.resize_image, t.resize_edit_mask, t.resize_protect_mask, t.resize_context, t.size_info];
  for (let index = 0; index < (node.outputs || []).length; index++) node.outputs[index].localized_name = outputs[index];
  for (const widget of node.widgets || []) {
    if (widget.name === "vm_language") {
      widget.label = t.language;
      widget.options.values = [t.auto, "中文", "English"];
      widget.value = node.properties.vm_language === "zh" ? "中文" : node.properties.vm_language === "en" ? "English" : t.auto;
    } else if (widget.name === "resize_mode") {
      widget.label = t.resize_mode;
      widget.options.values = Object.values(RESIZE_MODES).map(key => t[key]);
      widget.value = t[RESIZE_MODES[node.properties.vm_resize_mode] || "keep"];
    } else if (t[widget.name]) {
      widget.label = t[widget.name];
    }
    if (widget.options && t[`${widget.name}_help`]) widget.options.tooltip = t[`${widget.name}_help`];
  }
  const unchanged = node.properties.vm_resize_mode === "保持原尺寸";
  for (const name of ["target_size", "interpolation"]) {
    const widget = node.widgets?.find(item => item.name === name);
    setWidgetHidden(node, widget, true);
    const control=node.vmResizeControls?.[name];
    if(control){control.label.textContent=t[name];control.input.disabled=unchanged;control.input.value=widget.value;}
  }
  if (node.vmSizeStatus) {
    const message = node.vmSizeInfo ?
      `${t.last_size_info}: ${node.vmSizeInfo}${node.vmSizeStale ? ` · ${t.size_stale}` : ""}` : t.no_size_info;
    node.vmSizeStatus.textContent = actualLanguage(node)==="zh" ? "尺寸信息 / 缩放参数 ↗" : "Size info / Resize options ↗";
    node.vmSizeStatus.title=message;
    if(node.vmResizeDetails)node.vmResizeDetails.textContent=message;
  }
  node.setDirtyCanvas?.(true, true);
}

function installResizeUI(node) {
  node.vmResizeLiveSession = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
  node.vmResizeSubmissions = new Map();
  node.vmResizePendingResults = new Map();
  node.vmResizeSequence = 0;
  node.vmResizeAppliedSequence = 0;
  node.vmResizeRevision = 0;
  node.properties ||= {};
  node.properties.vm_language = languageChoice(node.properties.vm_language);
  node.properties.vm_resize_mode = resizeMode(node.properties.vm_resize_mode ||
    node.widgets?.find(widget => widget.name === "resize_mode")?.value);
  const language = node.addWidget("combo", "vm_language", "auto", value => {
    node.properties.vm_language = languageChoice(value);
    translateResizeNode(node);
  }, { values: ["自动", "中文", "English"] });
  language.serializeValue = () => node.properties.vm_language;
  const mode = node.widgets?.find(widget => widget.name === "resize_mode");
  if (mode) {
    const prior = mode.callback;
    mode.callback = function(value, ...args) {
      node.properties.vm_resize_mode = resizeMode(value);
      prior?.call(this, value, ...args);
      node.vmResizeRevision++;
      node.vmSizeStale = true;
      translateResizeNode(node);
    };
    mode.serializeValue = () => node.properties.vm_resize_mode;
  }
  for (const name of ["target_size", "interpolation", "divisible_by"]) {
    const widget = node.widgets?.find(item => item.name === name);
    if (!widget) continue;
    const prior = widget.callback;
    widget.callback = function(value, ...args) {
      prior?.call(this, value, ...args);
      node.vmResizeRevision++;
      node.vmSizeStale = true;
      translateResizeNode(node);
    };
  }
  const status = document.createElement("div");
  status.style.cssText = "box-sizing:border-box;width:100%;height:28px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:4px 6px;color:#b8c8d0;font:12px/20px sans-serif;cursor:pointer;";
  status.classList.add("vmn-inline-panel");
  node.vmSizeStatus = status;
  const options=document.createElement("div"),details=document.createElement("p");
  node.vmResizeControls={};node.vmResizeDetails=details;options.append(details);
  for(const name of ["target_size","interpolation"]){
    const widget=node.widgets.find(w=>w.name===name),label=document.createElement("label");
    const input=document.createElement(name==="target_size"?"input":"select");
    if(name==="target_size"){input.type="number";input.required=true;input.min=widget.options.min;input.max=widget.options.max;input.step=1;}
    else for(const value of widget.options.values||[])input.append(new Option(value,value));
    input.setAttribute("aria-label",`VM resize ${name}`);
    input.style.cssText="display:block;width:100%;margin:8px 0 16px;padding:6px;background:#353535;color:#eee;";
    input.onchange=()=>{if(!input.checkValidity()){input.reportValidity();input.value=widget.value;return;}widget.value=name==="target_size"?Number(input.value):input.value;widget.callback?.(widget.value);};
    options.append(label,input);node.vmResizeControls[name]={label,input};
  }
  node.vmResizeDialog=createPanelDialog(node,options,"resize");
  status.setAttribute("role","button");status.tabIndex=0;
  status.onclick=()=>{translateResizeNode(node);node.vmResizeDialog.showModal();};
  status.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();status.click();}};
  node.addDOMWidget("vm_size_status", "vm_size_status", status, {
    getMinHeight: () => 28, getMaxHeight: () => 28, serialize: false,
  });
  translateResizeNode(node);
}

function revealOptionalInputs(node) {
  // Execution routing is independent of users' canvas presentation choices.
  node.setDirtyCanvas?.(true, true);
}

function rewritePrompt(result) {
  const prompt = result.output;
  const shells = app.graph?._nodes?.filter(node => node.type === SHELL) || [];
  if (!shells.length) return result;
  const mapping = new Map();
  const unified = [];
  for (const shell of shells) {
    const id = String(shell.id), entry = prompt[id];
    if (!entry) continue;
    const p = PREFIX_PLAN + id, f = PREFIX_FINISH + id;
    const incoming = entry.inputs;
    if (shell.properties?.vm_backend === "flux2_klein9b")
      throw Error(`VMN_BACKEND_REMOVED: ${ERRORS.VMN_BACKEND_REMOVED[actualLanguage(shell)]}`);
    const linked = name => shell.inputs?.some(slot => slot.name === name && slot.link != null);
    const selection = modeInput(incoming.selection_mode, shell.properties?.vm_selection, "selection_mode", linked("selection_mode"));
    if (!incoming.image || (!incoming.edit_mask && selection !== "full_image")) throw Error(`VMNodes bridge ${id}: ${I18N[actualLanguage(shell)].missing_inputs}`);
    const planInputs = {
      image: incoming.image, prompt: incoming.prompt,
      selection_mode: selection,
      canvas_policy: shell.properties?.vm_canvas_policy === "external" ? "external" : "legacy",
    };
    if (shell.properties?.vm_backend) planInputs.backend = shell.properties.vm_backend;
    if (incoming.edit_mask && selection !== "full_image") planInputs.edit_mask = incoming.edit_mask;
    for (const name of ["sam_model", "sam_clip", "protect_mask", "image_context"]) {
      if (incoming[name] != null) planInputs[name] = incoming[name];
    }
    prompt[p] = { class_type: "VMEditPlan", inputs: planInputs };
    const finishInputs = {
      plan: [p, 0], run_mode: modeInput(incoming.run_mode, shell.properties?.vm_run, "run_mode", linked("run_mode")),
      filename_prefix: incoming.filename_prefix || "VMNodes/Edit",
      frontend_session: shell.vmLiveSession,
      seam_harmonization: modeInput(incoming.seam_harmonization, shell.properties?.vm_seam_harmonization,
        "seam_harmonization", linked("seam_harmonization")),
    };
    if (!Array.isArray(finishInputs.seam_harmonization) && !["off", "auto"].includes(finishInputs.seam_harmonization)) {
      throw Error("VMN_HARMONIZE_MODE: Select Off / Auto for seam harmonization / 接缝协调请选择关闭或自动。");
    }
    if (incoming.generated_pre) finishInputs.generated_pre = incoming.generated_pre;
    prompt[f] = { class_type: "VMEditFinish", inputs: finishInputs };
    if (shell.properties.vm_unified) unified.push({ plan: p, finish: f,
      protect: shell.properties.vm_use_protection === true, reference: shell.properties.vm_reference_mode || "none", backendOutputs: shell.properties.vm_backend_outputs, shell });
    mapping.set(id, [[p, 1], [p, 2], [p, 3], [f, 2], [f, 1], [f, 0], [p, 6], [p, 7]]);
    delete prompt[id];
  }
  for (const entry of Object.values(prompt)) {
    for (const [name, value] of Object.entries(entry.inputs || {})) {
      if (!Array.isArray(value) || value.length !== 2) continue;
      const slots = mapping.get(String(value[0]));
      if (slots) {
        const mapped = slots[value[1]];
        if (!mapped) throw Error(`VMNodes bridge: invalid output slot ${value[1]}`);
        entry.inputs[name] = mapped;
      }
    }
  }
  if (unified.length) {
    const outputs = new Set((app.graph?._nodes || []).filter(node => node.constructor.nodeData?.output_node ||
      [SHELL, RESIZE, "SaveImage", "PreviewImage", "VMEditFinish"].includes(node.type)).map(node => String(node.id)));
    try { routeUnified(prompt, unified, outputs); }
    catch (error) {
      const code = String(error.message), translated = ERRORS[code]?.[actualLanguage(unified[0].shell)];
      throw Error(translated ? `${code}: ${translated}` : code);
    }
  }
  return result;
}

const extensionKey = Symbol.for("VMNodes.ImageEditBridge.registered");
if (!app[extensionKey]) {
app.registerExtension({
  name: "VMNodes.ImageEditBridge",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (![SHELL, RESIZE].includes(nodeData.name)) return;
    const installedKey = Symbol.for("VMNodes.ImageEditBridge.nodeInstalled");
    if (Object.hasOwn(nodeType.prototype, installedKey)) return;
    Object.defineProperty(nodeType.prototype, installedKey, { value: true });
    if (nodeData.name === RESIZE) {
      const created = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function(...args) {
        const result = created?.apply(this, args);
        installResizeUI(this);
        return result;
      };
      const configured = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function(...args) {
        const result = configured?.apply(this, args);
        this.properties.vm_language = languageChoice(this.properties.vm_language);
        this.properties.vm_resize_mode = resizeMode(this.properties.vm_resize_mode ||
          this.widgets?.find(widget => widget.name === "resize_mode")?.value);
        translateResizeNode(this);
        return result;
      };
      const connectionsChanged = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function(...args) {
        const result = connectionsChanged?.apply(this, args);
      this.vmResizeRevision++;
        this.vmSizeStale = true;
        translateResizeNode(this);
        return result;
      };
      const serialized = nodeType.prototype.onSerialize;
      nodeType.prototype.onSerialize = function(data, ...args) {
        const result = serialized?.call(this, data, ...args);
        data.properties ||= {};
        data.properties.vm_language = this.properties.vm_language;
        data.properties.vm_resize_mode = this.properties.vm_resize_mode;
        if (data.widgets_values_named) {
          data.widgets_values_named.resize_mode = this.properties.vm_resize_mode;
          data.widgets_values_named.vm_language = this.properties.vm_language;
        }
        return result;
      };
      return;
    }
    if (nodeData.name !== SHELL) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function(...args) {
      const result = created?.apply(this, args);
      installNodeUI(this);
      return result;
    };
    const connectionsChanged = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function(...args) {
      const result = connectionsChanged?.apply(this, args);
      markResultStale(this);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(...args) {
      const result = configured?.apply(this, args);
      // Adding a backend widget before the frontend language control shifts old
      // positional arrays. Restore by name (or the known legacy schema) first.
      const saved = args[0] || {}, named = saved.widgets_values_named || {};
      const modern = saved.properties?.vm_widget_schema === 2 || Object.hasOwn(named, "seam_harmonization");
      const names = modern ? ["prompt", "selection_mode", "run_mode", "filename_prefix", "seam_harmonization", "vm_language"] :
        ["prompt", "selection_mode", "run_mode", "filename_prefix", "vm_language"];
      const values = Object.fromEntries(names.map((name, i) => [name, named[name] ?? saved.widgets_values?.[i]]));
      for (const name of ["prompt", "filename_prefix"]) {
        const widget = this.widgets?.find(w => w.name === name);
        if (widget && values[name] !== undefined) widget.value = values[name];
      }
      this.properties.vm_language = languageChoice(saved.properties?.vm_language ?? values.vm_language);
      this.properties.vm_seam_harmonization = modeChoice(modern ?
        (saved.properties?.vm_seam_harmonization ?? values.seam_harmonization) : "off", "seam_harmonization");
      this.properties.vm_language = languageChoice(this.properties.vm_language);
      this.properties.vm_unified = args[0]?.properties?.vm_unified === true;
      this.properties.vm_canvas_policy = args[0]?.properties?.vm_canvas_policy === "external" ? "external" : "legacy";
      this.properties.vm_selection = modeChoice(saved.properties?.vm_selection ?? values.selection_mode, "selection_mode");
      this.properties.vm_run = modeChoice(saved.properties?.vm_run ?? values.run_mode, "run_mode");
      for (const [name, type] of [["guide_image", "IMAGE"], ["generation_prompt", "STRING"]]) {
        if (!this.outputs?.some(slot => slot.name === name)) this.addOutput(name, type);
      }
      // Dialogs are transient, not reopened when importing a workflow or PNG.
      this.properties.vm_preview_expanded = false;
      this.properties.vm_advanced_expanded = false;
      applyAdvancedVisibility(this);
      translateNode(this);
      return result;
    };
    const serialized = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function(data, ...args) {
      const result = serialized?.call(this, data, ...args);
      data.properties ||= {};
      data.properties.vm_language = this.properties.vm_language;
      data.properties.vm_canvas_policy = this.properties.vm_canvas_policy;
      data.properties.vm_selection = this.properties.vm_selection;
      data.properties.vm_run = this.properties.vm_run;
      data.properties.vm_widget_schema = 2;
      data.properties.vm_seam_harmonization = this.properties.vm_seam_harmonization;
      data.properties.vm_unified = this.properties.vm_unified === true;
      data.properties.vm_reference_mode = this.properties.vm_reference_mode || "none";
      data.properties.vm_use_protection = this.properties.vm_use_protection === true;
      data.widgets_values_named ||= {};
      for (const name of ["prompt", "filename_prefix"]) {
        const widget = this.widgets?.find(w => w.name === name);
        if (widget) data.widgets_values_named[name] = widget.value;
      }
      if (data.widgets_values_named) {
        data.widgets_values_named.seam_harmonization = this.properties.vm_seam_harmonization;
        data.widgets_values_named.selection_mode = this.properties.vm_selection;
        data.widgets_values_named.run_mode = this.properties.vm_run;
        data.widgets_values_named.vm_language = this.properties.vm_language;
      }
      return result;
    };
  },
  setup() {
    const setupKey = Symbol.for("VMNodes.ImageEditBridge.setup");
    if (app[setupKey]) return;
    app[setupKey] = true;
    // Some frontend versions leave a full-height wrapper around zero-height
    // DOM widgets. Only real controls may intercept canvas pointer events.
    const inlineStyle = document.createElement("style");
    inlineStyle.textContent = `
      .dom-widget:has(> .vmn-inline-panel), .vmn-inline-panel { pointer-events: none !important; }
      .vmn-inline-panel select, .vmn-inline-panel label, .vmn-inline-panel input { pointer-events: auto; }
    `;
    document.head.appendChild(inlineStyle);
    const original = app.graphToPrompt.bind(app);
    app.graphToPrompt = async (...args) => rewritePrompt(await original(...args));
    const queuePrompt = api.queuePrompt.bind(api);
    api.queuePrompt = async (...args) => {
      const output = args.map(outputGraph).find(Boolean);
      if (!output) return queuePrompt(...args);
      const submissions = [];
      const resizeSubmissions = [];
      for (const [id, item] of Object.entries(output)) {
        if (item?.class_type === RESIZE) {
          const resize = app.graph?.getNodeById(id) || app.graph?.getNodeById(Number(id));
          if (resize?.type === RESIZE) {
            const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
            // Submission identity stays in the frontend, outside the image cache key.
            delete item.inputs.frontend_session;
            resizeSubmissions.push({resize, token});
          }
          continue;
        }
        if (item?.class_type !== "VMEditFinish" || !id.startsWith(PREFIX_FINISH)) continue;
        const shellId = id.slice(PREFIX_FINISH.length);
        const shell = app.graph?.getNodeById(shellId) || app.graph?.getNodeById(Number(shellId));
        if (!shell || shell.type !== SHELL) continue;
        const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
        item.inputs.frontend_session = `${shell.vmLiveSession}|${token}`;
        submissions.push({shell, token});
      }
      const signature = promptSignature(output);
      for (const submission of submissions) {
        const {shell, token} = submission;
        shell.vmSubmissions.set(token, {signature, promptId: null,
          revision: shell.vmInputRevision});
        shell.vmLatestSubmission = token;
        if (shell.vmSubmissions.size > 20) shell.vmSubmissions.delete(shell.vmSubmissions.keys().next().value);
      }
      for (const {resize, token} of resizeSubmissions) {
        resize.vmResizeSubmissions.set(token, {signature: resizeSignature(output, resize.id), promptId: null,
          revision: resize.vmResizeRevision, sequence: ++resize.vmResizeSequence});
        resize.vmResizeLatestSubmission = token;
        if (resize.vmResizeSubmissions.size > 20) resize.vmResizeSubmissions.delete(resize.vmResizeSubmissions.keys().next().value);
      }
      try {
        const result = await queuePrompt(...args);
        for (const {shell, token} of submissions) {
          const state = shell.vmSubmissions.get(token);
          if (state) state.promptId = result?.prompt_id || null;
        }
        for (const {resize, token} of resizeSubmissions) {
          const state = resize.vmResizeSubmissions.get(token);
          if (state) {
            state.promptId = result?.prompt_id || null;
            const early = resize.vmResizePendingResults.get(state.promptId);
            if (early) {
              resize.vmResizePendingResults.delete(state.promptId);
              await applyResizeResult(resize, early);
            }
          }
        }
        return result;
      } catch (error) {
        for (const {shell, token} of submissions) shell.vmSubmissions.delete(token);
        for (const {resize, token} of resizeSubmissions) resize.vmResizeSubmissions.delete(token);
        throw error;
      }
    };
    let last = comfyLanguage();
    setInterval(() => {
      const current = comfyLanguage();
      for (const node of app.graph?._nodes || []) {
        if (node.type === SHELL) {
          updateGuidanceStatus(node);
          if (current !== last && node.properties?.vm_language === "auto") translateNode(node);
          if (node.vmLastNodes2 !== nodes2Enabled()) applyAdvancedVisibility(node);
        } else if (node.type === RESIZE && current !== last && node.properties?.vm_language === "auto") {
          translateResizeNode(node);
        }
      }
      last = current;
    }, 700);
    api.addEventListener("executed", async ({ detail }) => {
      const id = String(detail?.node || "");
      if (app.graph && !id.startsWith(PREFIX_FINISH)) {
        const resize = app.graph.getNodeById(id) || app.graph.getNodeById(Number(id));
        if (resize?.type === RESIZE && detail.output?.vm_size_info) {
          await applyResizeResult(resize, detail);
        }
      }
      if (!id.startsWith(PREFIX_FINISH)) return;
      const shellId = id.slice(PREFIX_FINISH.length);
      const shell = app.graph?.getNodeById(shellId) || app.graph?.getNodeById(Number(shellId));
      if (!shell || shell.type !== SHELL) return;
      const session = uiText(detail.output?.vm_session);
      const [liveSession, token] = session.split("|");
      if (liveSession !== shell.vmLiveSession) return;
      const state = shell.vmSubmissions.get(token);
      if (token && !state) return;
      if (state?.promptId && detail.prompt_id && state.promptId !== detail.prompt_id) return;
      const item = detail.output?.images?.[0];
      if (!item || !shell.vmPreviewImage) return;
      const query = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder || "", type: item.type || "output" });
      shell.vmPreviewImage.src = api.apiURL(`/view?${query}`);
      shell.vmPreviewStage = uiText(detail.output.vm_stage);
      shell.vmResultSelection = uiText(detail.output.vm_selection);
      shell.vmSeamStatus = uiText(detail.output.vm_seam_status);
      shell.vmProtectionWarnings = detail.output.vm_warnings || [];
      let currentSignature;
      try { currentSignature = promptSignature((await app.graphToPrompt()).output); }
      catch { currentSignature = null; }
      shell.vmResultStale = !state || shell.vmLatestSubmission !== token ||
        state.revision !== shell.vmInputRevision ||
        currentSignature !== state.signature;
      translateNode(shell);
      shell.setDirtyCanvas?.(true, true);
    });
    api.addEventListener("execution_error", ({ detail }) => {
      const id = String(detail?.node_id || "");
      const match = id.match(/^vm15[pf]_(.+)$/);
      const node = match ? app.graph?.getNodeById(match[1]) || app.graph?.getNodeById(Number(match[1])) :
        app.graph?.getNodeById(id) || app.graph?.getNodeById(Number(id));
      if (!node || (node.type !== SHELL && node.type !== RESIZE)) return;
      const code = String(detail?.exception_message || "").match(/VMN_[A-Z_]+/)?.[0];
      const translation = ERRORS[code];
      if (!translation) return;
      const lang = actualLanguage(node);
      app.extensionManager?.toast?.add?.({ severity: "error", summary: I18N[lang][node.type === RESIZE ? "resize_title" : "title"],
        detail: translation[lang], life: 9000 });
    });
  },
});
app[extensionKey] = true;
}
