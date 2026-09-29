# VMNodes

**中文** | [English](README.en.md)

VMNodes 是一个持续扩展的 ComfyUI 节点工具包。整个包统一安装和更新，各个节点按需使用。

## 当前节点

| 节点 | 用途 | 使用说明 |
| --- | --- | --- |
| **VM 图像编辑** | 描述编辑需求，选择修改范围，预览并回贴编辑结果；支持不画遮罩的整图编辑 | [如何使用](docs/zh/nodes/image-edit.md) |
| **VM 图像缩放与对齐** | 调整尺寸、缩放算法和尺寸整除数，同步处理图像与遮罩 | [如何使用](docs/zh/nodes/image-resize.md) |

图像编辑当前配合 **Qwen Image 2.1** 使用。缩放节点无需生成模型，可单独使用。安装后搜索 `VMNodes`、英文节点名或中文节点名。

## 安装

1. 将本包放到 `ComfyUI/custom_nodes/VMNodes`。该目录内应直接看到 `__init__.py`。
2. 使用 **ComfyUI 自己的 Python 环境**，在 ComfyUI 根目录执行：

   ```shell
   python custom_nodes/VMNodes/install.py
   ```

   便携版或整合包请将 `python` 替换为其自带 Python 的路径。
   安装程序会复用已有的兼容 OpenCV，不会自动替换 PyTorch/CUDA。
3. 重启 ComfyUI，刷新页面。

只用缩放节点，到这里即可。使用图像编辑时，继续按[编辑说明](docs/zh/nodes/image-edit.md)准备模型并导入[示例工作流](workflows/image_edit/VM_图像编辑.json)。示例中的图片请替换为自己的图片。

普通粗选、严格遮罩和整图编辑不需要 SAM 或 Ultralytics；“细化到物体”所需的可选资源在编辑说明中单独列出。

当前为首次发布候选，尚未上架 Registry / Manager，暂不提供可用的在线安装地址。

## 更新

更新整个 VMNodes 即可，不需要分别更新节点。更新后重启 ComfyUI 并刷新页面。

- Git 安装：在没有本地修改的 VMNodes 分支目录执行 `git pull --ff-only`。
- ZIP 安装：关闭相关 ComfyUI 实例，将旧目录备份到 `custom_nodes` 之外，再放入新版 `VMNodes`，不要叠加覆盖旧文件。
- 依赖发生变化时，重新执行上面的依赖安装命令。

从旧版图像编辑交付包升级、固定版本或回退，请看[更新说明](docs/zh/update.md)。用户自己的工作流应保存在用户目录，不要直接覆盖仓库内的示例。

## 反馈与许可

VMNodes 代码采用 MIT。Qwen Image 2.1 模型另受 [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE) 约束；商业使用需按模型发布方条款另行取得许可。

反馈问题时，请附上 VMNodes 版本、ComfyUI 版本、错误信息及可以复现问题的工作流；分享前移除私人图片和敏感信息。

[更新记录](CHANGELOG.md) · [MIT 许可证](LICENSE) · [第三方组件说明](THIRD_PARTY_NOTICES.md)
