# Changelog / 更新记录

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
