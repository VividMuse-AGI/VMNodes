# Changelog / 更新记录

## Unreleased

- 区域展开编辑的文字和描述输入框默认各 12 行；手动调整的高度按字段保存，切换区域、收起再展开、保存工作流后重载均保持，节点高度随输入框调整。
- Region inspector text and caption fields now default to 12 rows each. Resized heights persist independently across region switches, reopening and workflow reloads, with the node adapting to the drawer height.

## 0.3.0 — 2026-10-27 — MOSS V2.3

### 中文

- 新增无需模型的 V2.3 示例工作流、中英文快速开始和实测截图；示例随安装包提供。

- 修复 V2.3 抽屉在执行回填后继续改字未保存的问题；全局描述默认高 84px、可纵向拖高并保存高度；三分线默认开启且保留用户已保存的关闭状态。补充真实执行后编辑回归，修复浏览器关闭按钮定位与 Windows 子进程 UTF-8 解码。
- MOSS 排版节点 V2.3：工具栏新增 `📐 三分线` / `🔱 黄金线` 独立开关，参考线改为在所有画框之后绘制的顶层白色虚线（带深色衬底），开启吸附时拖动框会自动吸附到参考线；状态持久化到 `node.properties`，不进入任何输出 JSON。
- MOSS 排版节点 V2.3：图层行新增 `⤢` 展开按钮，列表下方出现全宽大号多行文字编辑抽屉（渲染文字 + 样式描述，可拖拽拉高），与行内输入、画布和 `layout_data` 双向同步，切换选中框自动跟随且只占一个面板高度。
- MOSS 排版节点 V2.3：新增 `global_prompt_in` 与 `box_texts_in` 外部文本端口，支持 `T1: 标题 | 样式` 标签语法与按行顺序注入文字框，运行后通过 `synced_caption` / `synced_layout_data` 回填画布与图层列表。

### English

- Added a model-free V2.3 example workflow, bilingual quickstart and verified screenshots; the example is included in the installation ZIP.

- Fixed inspector edits being lost after execution backfill. The global caption starts at 84px and supports persistent vertical resizing. Thirds are enabled by default while saved disabled settings remain intact. Added execution/edit round-trip regressions and fixed modal-close targeting and Windows UTF-8 subprocess decoding.
- MOSS layout node V2.3: independent `📐 Thirds` / `🔱 Golden` toolbar toggles; guides are now a top-layer white dashed overlay with a dark halo, snap boxes onto them while dragging, persist in `node.properties` and never enter any output JSON.
- MOSS layout node V2.3: every layer row gains a `⤢` button that opens a full-width multi-line text inspector (exact text + style caption, vertically resizable) kept in two-way sync with the row, canvas and `layout_data`; it follows the selection and only ever occupies one panel.
- MOSS layout node V2.3: new `global_prompt_in` and `box_texts_in` text inputs with `T1: title | style` labels and positional lines, mirrored back to the canvas through `synced_caption` / `synced_layout_data`.

## 0.2.0 — 2026-10-25 — Pre-release · MOSS Layout Studio

- 新增 MOSS 海报布局节点：文字、角色、物体框，图层排序，17 组尺寸预设，中英文界面，Draft/Compiled JSON 导入及提示词输出。
- 支持画布缩放／平移、全部隐藏／显示、全局和图层色板、原生吸管及画布放大镜降级、参考图主色提取。
- 新增总像素（MP）设置及实际尺寸显示；新增居中扩展同步：前景保持像素尺寸，参考图同步居中，缩小时整体等比适配。
- 修复隐藏图层列表跳顶、覆盖导入后的旧视图残留、误贴 Python 脚本、吸管缩放坐标及主色提取噪点过滤。
- Added the bilingual MOSS layout node, JSON bridge, layer controls, zoom/pan, palettes, eyedroppers and reference palette extraction.
- Added megapixel sizing and Center Layout sync: retain foreground pixels on expansion, center the reference image, and uniformly fit smaller canvases.
- Fixed layer-list scroll resets, import framing, Python-script paste handling, zoomed pixel sampling and palette noise filtering; added unit, browser and real-API regression suites.

## 0.1.0 — 2026-10-03 — Pre-release

### 中文

首次公开测试版。

- **VM 图像编辑**：支持粗选范围、严格遮罩、整图编辑和可选物体细化，提供范围预览与 Final 输出。
- **VM 图像缩放与对齐**：同步处理图像与遮罩，可选择缩放算法和尺寸整除数。
- **Qwen Image 2.1 单图示例**：使用 8 步 LoRA，已连接标准保存图像节点；普通编辑无需 SAM。
- **语言与使用说明**：节点可自动跟随 ComfyUI 语言，或选择中文、English；提供中英文安装、使用和更新说明。

开始使用请看 [README](README.md)，效果边界见[使用示例](docs/zh/editing-examples.md)。

### English

First public Pre-release.

- **VM Image Edit**: coarse-region, strict-mask and full-image editing, optional object refinement, range previews and a Final output.
- **VM Image Resize & Align**: resize images and masks together, with selectable interpolation and dimension alignment.
- **Qwen Image 2.1 single-image example**: 8-step LoRA with standard Save Image already connected; ordinary editing needs no SAM.
- **Language and guides**: follow ComfyUI's language automatically or choose Chinese or English, with bilingual installation, usage and update guides.

Start with the [README](README.en.md), and see [editing examples](docs/en/editing-examples.md) for result limits.
