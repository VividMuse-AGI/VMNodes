# VMNodes

**中文** | [English](README.en.md)

VMNodes 是一个持续扩展的 ComfyUI 节点工具包。整个包统一安装和更新，各个节点按需使用。

**v0.3.3 · 外部 JSON 同步保留手动编辑**。[下载正式版](https://github.com/VividMuse-AGI/VMNodes/releases/tag/v0.3.3)。不同 ComfyUI 版本、硬件和扩展组合仍可能需要兼容性调整。

**MOSS V2.3** 提供顶层构图参考线、展开式文字编辑和外部文案连线，已包含在 `v0.3.3` 安装包中。V2.3 是 MOSS 功能方案版本，`v0.3.3` 是整个 VMNodes 包的发布版本。

## 当前节点

| 节点 | 用途 | 使用说明 |
| --- | --- | --- |
| **VM 图像编辑** | 描述编辑需求，选择修改范围，预览并回贴编辑结果；支持不画遮罩的整图编辑 | [如何使用](docs/zh/nodes/image-edit.md) |
| **VM 图像缩放与对齐** | 调整尺寸、缩放算法和尺寸整除数，同步处理图像与遮罩 | [如何使用](docs/zh/nodes/image-resize.md) |
| **VM MOSS 海报布局工作台** | 节点内画框排版、导入导出 JSON、色板与吸管、总像素尺寸、居中扩展同步 | [如何使用](docs/zh/nodes/moss-layout.md) |

图像编辑当前配合 **Qwen Image 2.1** 使用。缩放节点无需生成模型，可单独使用。安装后搜索 `VMNodes`、英文节点名或中文节点名。

局部编辑会保留许可范围外的原图像素，但范围内的细节和边缘效果仍取决于生成结果。大幅改变轮廓、新露出的皮肤、细发丝与规则纹理交界可能不自然。看[使用示例与效果边界](docs/zh/editing-examples.md)，了解哪些结果需要重点检查。

MOSS 节点面向 **MOSS-Image**：`layout_prompt` 接 `CLIPTextEncode`，`width/height` 接潜空间节点。将海报改宽而保持人物、文字位置关系时，选择「Center Layout（居中扩展，缩小时整体适配）」。

**MOSS V2.3 更新包含在 v0.3.3 中**。Git 安装可拉取更新；ZIP 安装请下载 `VMNodes-0.3.3.zip`。更新后重启 ComfyUI 并刷新页面；旧的 `0.1.0` ZIP 不包含 MOSS 节点。

### MOSS V2.3：可直接导入的示例

[下载示例 JSON](https://raw.githubusercontent.com/VividMuse-AGI/VMNodes/v0.3.3/workflows/moss/MOSS-V2.3-Layout-Studio.json) · [查看工作流文件](workflows/moss/MOSS-V2.3-Layout-Studio.json) · [V2.3 验收报告](https://github.com/VividMuse-AGI/VMNodes/blob/main/tests/MOSS_V2.3_%E9%AA%8C%E6%94%B6%E6%8A%A5%E5%91%8A.md)

示例预置一张 **896×1152、5 个框**的植物展海报布局，包含背景、人物、标题、副标题和活动时间。只使用 **VMNodes + ComfyUI 自带节点**，无需模型、参考图片或额外节点包；点击运行即可得到框位置预览和 `layout_prompt` JSON。预览是布局示意图，不是 AI 生成的海报。

1. 安装或更新到 `v0.3.3`，重启 ComfyUI 并刷新页面。Git 安装可按下方更新说明操作；ZIP 安装请使用 [v0.3.3 安装包](https://github.com/VividMuse-AGI/VMNodes/releases/download/v0.3.3/VMNodes-0.3.3.zip)。旧的 `v0.2.0` Release ZIP 不包含 V2.3。
2. 下载示例 JSON，拖入 ComfyUI，或通过工作流“打开”导入。**这是完整工作流文件，请勿粘贴到 MOSS 工具栏的“导入 JSON”弹窗。**
3. 点击运行。左侧两个 **Text (Multiline)** 节点分别连到 `global_prompt_in` 和 `box_texts_in`；右侧显示框位置预览和编译后的 JSON。
4. 修改左侧 `T1: NIGHT GARDEN | ...`，再次运行，标题及样式会回填到画布。`T1/T2/T3` 对应文字框，`C1` 对应人物，`O1` 对应背景；文案中的字面 `\n` 会转换成换行。
5. 点击图层行的 **⤢** 展开大号文字编辑区（文字和描述默认各 12 行，手动高度随区域切换与工作流保存保留），拖动框调整排版；用 **📐 三分线 / 🔱 黄金线** 辅助对齐。参考线只用于编辑器，不进入输出 JSON 或后端预览图。顶部全局描述也可纵向拖高。

**文案覆盖规则：** `box_texts_in` 保持连接时，每次执行都会以外部文案覆盖对应字段，即使上游内容没有变化。想保留抽屉里的手动改字，请先断开 `box_texts_in`，或同步修改左侧文本；`global_prompt_in` 的非空输入同样优先于节点内全局描述。拖动框的位置不受这两个文本输入影响。

**英文候选词（v0.3.2 起）：** 安装并启用 [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) 的 **Text Autocomplete**，并加载词库后，MOSS 图层行和展开编辑区的“样式 / 画面描述”也支持候选词补全。输入词语片段，用 ↑/↓ 选择，按 Tab/Enter 或点击插入，Esc 关闭；沿用扩展的词库、分隔符和按键设置。这是词库匹配，不是 AI 续写或翻译。“渲染文字”保持原样输入；未安装该扩展时照常编辑，无需额外依赖。

**启用补全：** 设置中搜索 `Autocomplete` → 勾选 **🐍 Text Autocomplete / Enabled** → **Manage Custom Words** → 在大文本框中每行一个词（例如 `long_hair`、`long_dress`、`soft_lighting`），点击 **Save**。已有词库时追加到末尾。回到区域描述框输入 `long` 测试。可启用 **Replace _ with space**；如需 Enter 始终换行，关闭 **Insert on Enter** 并保留 Tab 选词。没有词库时不保证普通英文词语出现候选。更新后请刷新页面。

![MOSS V2.3 示例：外部文本连线、展开编辑、构图参考线及布局输出](https://raw.githubusercontent.com/VividMuse-AGI/VMNodes/v0.3.3/docs/images/moss-v23-workflow.jpg)

本示例已在 ComfyUI **0.43.0 / 前端 1.57.4** 完成浏览器导入、真实执行及编辑回填验证：[21 项检查结果](https://github.com/VividMuse-AGI/VMNodes/blob/main/tests/evidence/moss_v23_example_20261027/checks.json)。如缺少 `PrimitiveStringMultiline` 或 `PreviewAny`，请更新 ComfyUI。接入实际出图工作流时，将 `layout_prompt` 接到 MOSS 文本编码、`width/height` 接到对应潜空间尺寸，并另行准备 MOSS 模型与采样链。

### 将 layout prompt 还原为可编辑布局

**文本框直接连接「外部布局 JSON」：** 将「外部同步方式」设为 **On Change（仅外部 JSON 变化时同步）**。首次运行导入布局；之后移动、缩放、增删框或修改文字，再运行会保留编辑。只有上游 JSON 内容改变时才重新覆盖画布；缩进、键顺序或代码围栏变化不会触发覆盖。导入记录随工作流保存。新节点默认使用此模式，旧工作流需手动切换。`Replace` / `Merge` 仍然每次执行同步；需要强制重新导入同一份 JSON 时，临时切换 `Replace` 执行一次，再切回 `On Change`。

已有 MOSS `layout_prompt` 时，可通过工具栏「📥 导入 JSON」→「覆盖画布」，**预览框的位置，拖动或调整框的大小，再输出修改后的布局提示词**。支持 Draft（`abs` + `xyxy`）和编译后的布局 JSON（`abs_centralized` + `yxyx`）；无需先生成图片即可检查框之间的位置关系。普通描述文本不包含框坐标，不能据此恢复布局。

相较于本次核对的官方 **Create Bounding Boxes + MOSS-Image Layout Prompt**，这一功能省去了完整布局 JSON 到官方框数据格式的额外转换。官方支持导入自己的框/element 数据，但没有直接解析完整 MOSS `layout_prompt` 并恢复框的入口。用 1152×2048 的 18 框海报执行真实 API 对照时，VM 从空画布导入带源尺寸的 Draft 后，18 框坐标全部准确恢复；这证明布局数据恢复能力，不代表生成画质优于官方。

**源尺寸注意事项：** 编译后的 `layout_prompt` 可能不含 `width` / `height`。导入前，请在 JSON 顶层补上**生成该布局时的原画布尺寸**，或先将节点画布设为原尺寸。例如原稿为 1152×2048，就使用 `"width": 1152, "height": 2048`，不能直接填写准备改成的新尺寸。恢复后再改尺寸，并选择所需的比例同步模式。

缺少尺寸时，导入器会按当前画布解释坐标；画布太小且框坐标超出边界时会报错。**没有报错也不代表原尺寸正确**，错误尺寸仍可能导致位置偏移。不要根据框的最外边界猜原尺寸；建议保留带尺寸的 Draft，详细操作见 [MOSS 使用说明](docs/zh/nodes/moss-layout.md)。

## 安装

1. 推荐使用 Git，方便后续更新。在 **ComfyUI 根目录**执行：

   ```shell
   git clone https://github.com/VividMuse-AGI/VMNodes.git custom_nodes/VMNodes
   ```

   如使用 ZIP 安装，在[本仓库 Releases](https://github.com/VividMuse-AGI/VMNodes/releases)的 **Assets** 中选择 `VMNodes-0.3.3.zip`；`VMNodes-0.3.3.zip.sha256` 提供 SHA-256 校验值。解压后将包目录 `VMNodes` 放到 `ComfyUI/custom_nodes/VMNodes`。该目录内应直接看到 `__init__.py`，不要多套一层目录。
2. 使用 **ComfyUI 自己的 Python 环境**，在 ComfyUI 根目录执行：

   ```shell
   python custom_nodes/VMNodes/install.py
   ```

   便携版或整合包请将 `python` 替换为其自带 Python 的路径。
   安装程序会复用已有的兼容 OpenCV，不会自动替换 PyTorch/CUDA。
3. 重启 ComfyUI，刷新页面。

只用缩放节点，到这里即可。使用图像编辑时，按[单图编辑快速开始](docs/zh/workflows/qwen-image-21-single-edit.md)准备 4 个模型文件，并安装 [rgthree-comfy](https://github.com/rgthree/rgthree-comfy)（示例中的图像对比和分组控制节点需要）。然后导入 [Qwen Image 2.1 单图编辑示例](workflows/image_edit/Qwen-Image-2.1-Single-Image-Edit.json)，上传自己的图片、画出范围、填写需求并运行。

默认工作流为 `Qwen-Image-2.1-Single-Image-Edit.json`，使用外接生成节点和 8 步 LoRA 设置。需要参考图或保护遮罩开关时，可使用[统一编辑示例](workflows/image_edit/VM_图像编辑.json)，具体区别见[编辑说明](docs/zh/nodes/image-edit.md)。

保存图片时，将 **VM 图像编辑的 Final → 保存图像**。示例已接好；文件名前缀在保存节点里设置。编辑节点自身只显示临时预览。

普通粗选、严格遮罩和整图编辑不需要 SAM 或 Ultralytics；“细化到物体”所需的可选资源在编辑说明中单独列出。

Registry / Manager 尚未上架，请使用上述 Git 或 Releases ZIP 安装方式。

## 更新

更新整个 VMNodes 即可，不需要分别更新节点。更新后重启 ComfyUI 并刷新页面。

- Git 安装：在没有本地修改的 VMNodes 分支目录执行 `git pull --ff-only`。
- ZIP 安装：关闭相关 ComfyUI 实例，将旧目录备份到 `custom_nodes` 之外，再放入新版 `VMNodes`，不要叠加覆盖旧文件。
- 依赖发生变化时，重新执行上面的依赖安装命令。

固定版本或回退，请看[更新说明](docs/zh/update.md)。用户自己的工作流应保存在用户目录，不要直接覆盖仓库内的示例。

## 反馈与许可

VMNodes 代码采用 MIT。Qwen Image 2.1 模型另受 [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE) 约束；商业使用需按模型发布方条款另行取得许可。

反馈问题时，请附上 VMNodes 版本、ComfyUI 版本、错误信息及可以复现问题的工作流；分享前移除私人图片和敏感信息。

[更新记录](CHANGELOG.md) · [MIT 许可证](LICENSE) · [第三方组件说明](THIRD_PARTY_NOTICES.md)
