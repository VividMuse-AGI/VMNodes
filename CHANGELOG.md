# Changelog / 更新记录

## Unreleased — MOSS Layout Studio

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
