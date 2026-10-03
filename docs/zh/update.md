# 更新与回退

[返回首页](../../README.md)

VMNodes **0.1.0** 是首次公开测试版（Pre-release）。首次安装请按[首页安装步骤](../../README.md#安装)操作；后续更新整个包即可，不需要分别更新节点。更新前将自己的工作流保存在用户目录，并关闭相关 ComfyUI 实例。

## Git 更新

在 `ComfyUI/custom_nodes/VMNodes` 目录运行 `git status`，确认没有本地修改，且当前处于更新用的分支，再执行：

```shell
git pull --ff-only
```

有本地修改或分支分叉时，先保留修改并处理冲突，不要强制覆盖。固定在版本标签上的安装应先在[本仓库 Releases](https://github.com/VividMuse-AGI/VMNodes/releases)选择目标版本，再切换到对应标签；上述命令只用于分支更新。

依赖发生变化时，用 **ComfyUI 自己的 Python 环境**，在 ComfyUI 根目录重新执行：

```shell
python custom_nodes/VMNodes/install.py
```

便携版或整合包请将 `python` 替换为其自带 Python 的路径。完成后重启 ComfyUI 并刷新页面。

## ZIP 更新或替换已有安装

1. 在[本仓库 Releases](https://github.com/VividMuse-AGI/VMNodes/releases)的 **Assets** 中下载所需版本的安装包，例如 `VMNodes-0.1.0.zip`；同名 `.zip.sha256` 文件提供 SHA-256 校验值。
2. 将已有 `custom_nodes/VMNodes` 备份到 `custom_nodes` **之外**，不要在扫描目录中保留 `VMNodes_old` 等副本。
3. 解压新版，将包目录命名为 `VMNodes`，放到 `custom_nodes/VMNodes`。确认目录内直接存在 `__init__.py` 和 `pyproject.toml`，不要叠加覆盖旧文件。
4. 使用 ComfyUI 的 Python 运行上面的依赖安装命令，重启并刷新页面，再打开自己的工作流。

用户自己的工作流应保存在用户目录，避免替换代码时丢失。若要从 ZIP 改用 Git 安装，先按上述方式备份旧目录，再执行[首页的克隆命令](../../README.md#安装)。

## 回退

停止相关 ComfyUI 实例，用备份或选定的历史版本恢复 `VMNodes`，核对该版本的依赖要求，再重启并刷新页面。没有历史公开版本可用时，使用自己的备份。不要自动降级整套 PyTorch/CUDA。

模型、输入输出图片和用户目录不属于代码替换范围，无需删除。Registry / Manager 安装与版本选择说明将在完成上架和验证后提供。
