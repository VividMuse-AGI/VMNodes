# VMNodes

**中文** | [English](README.en.md)

VMNodes 是一个持续扩展的 ComfyUI 节点工具包。整个包统一安装和更新，各个节点按需使用。

**v0.1.0 · 首次公开测试版（Pre-release）**。欢迎试用并反馈问题；不同 ComfyUI 版本、硬件和扩展组合仍可能需要兼容性调整。

## 当前节点

| 节点 | 用途 | 使用说明 |
| --- | --- | --- |
| **VM 图像编辑** | 描述编辑需求，选择修改范围，预览并回贴编辑结果；支持不画遮罩的整图编辑 | [如何使用](docs/zh/nodes/image-edit.md) |
| **VM 图像缩放与对齐** | 调整尺寸、缩放算法和尺寸整除数，同步处理图像与遮罩 | [如何使用](docs/zh/nodes/image-resize.md) |

图像编辑当前配合 **Qwen Image 2.1** 使用。缩放节点无需生成模型，可单独使用。安装后搜索 `VMNodes`、英文节点名或中文节点名。

局部编辑会保留许可范围外的原图像素，但范围内的细节和边缘效果仍取决于生成结果。大幅改变轮廓、新露出的皮肤、细发丝与规则纹理交界可能不自然。看[使用示例与效果边界](docs/zh/editing-examples.md)，了解哪些结果需要重点检查。

## 安装

1. 推荐使用 Git，方便后续更新。在 **ComfyUI 根目录**执行：

   ```shell
   git clone https://github.com/VividMuse-AGI/VMNodes.git custom_nodes/VMNodes
   ```

   如使用 ZIP 安装，在[本仓库 Releases](https://github.com/VividMuse-AGI/VMNodes/releases)的 **Assets** 中选择 `VMNodes-0.1.0.zip`；`VMNodes-0.1.0.zip.sha256` 提供 SHA-256 校验值。解压后将包目录 `VMNodes` 放到 `ComfyUI/custom_nodes/VMNodes`。该目录内应直接看到 `__init__.py`，不要多套一层目录。
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
