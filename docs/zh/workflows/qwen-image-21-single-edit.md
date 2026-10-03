# Qwen Image 2.1 单图编辑

[返回首页](../../../README.md) · [节点选项说明](../nodes/image-edit.md) · [English](../../en/workflows/qwen-image-21-single-edit.md)

导入 [Qwen-Image-2.1-Single-Image-Edit.json](../../../workflows/image_edit/Qwen-Image-2.1-Single-Image-Edit.json)，上传一张图片、画范围、写需求，即可生成并保存编辑结果。也可以不画遮罩，选择整图编辑。

## 安装与模型

1. 按[首页安装步骤](../../../README.md#安装)安装 VMNodes。
2. 安装 [rgthree-comfy](https://github.com/rgthree/rgthree-comfy)。在 ComfyUI 根目录执行下面的命令，并按该项目说明完成安装，然后重启 ComfyUI、刷新页面。示例中的 `Image Comparer (rgthree)` 和 `Fast Groups Bypasser (rgthree)` 需要它。

   ```shell
   git clone https://github.com/rgthree/rgthree-comfy.git custom_nodes/rgthree-comfy
   ```

3. 准备下面 4 个模型文件，并在工作流的相应加载器中选择实际文件。权重不包含在 VMNodes 安装包中。
4. 使用支持 `TextEncodeQwenImage21` 的 ComfyUI 版本；如果缺少这个官方节点，先更新 ComfyUI。

路径相对于 `ComfyUI/models/`。可使用自己的子目录，导入后重新选择模型即可。

| 文件用途 | 放置路径 | 下载入口 |
| --- | --- | --- |
| Qwen Image 2.1 主模型 | `diffusion_models/Qwen/qwen_image_2.1_int8_convrot.safetensors` | [Comfy-Org](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/diffusion_models/qwen_image_2.1_int8_convrot.safetensors) |
| 文本编码器 | `text_encoders/qwen3vl_8b_int8_convrot.safetensors` | [Comfy-Org](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors) |
| VAE | `vae/Qwen/qwen_image_2.1_vae_bf16.safetensors` | [Comfy-Org](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/vae/qwen_image_2.1_vae_bf16.safetensors) |
| 8 步加速 LoRA | `loras/Qwen/p_qwen_image_2.1_8step_v0.1.safetensors` | [PrunaAI](https://huggingface.co/PrunaAI/Pruna-Qwen-Image-2.1/blob/main/p_qwen_image_2.1_8step_v0.1.safetensors) |

普通粗选、严格遮罩和整图编辑不需要 SAM 或 Ultralytics。画布保留 SAM 加载器，默认没有连到 VM 图像编辑；日常编辑无需下载其模型。

## 第一次编辑

1. 在 **加载图像（Load Image）** 中上传自己的图片。示例没有附带图片，也没有预先选中的本机图片。
2. 右键主图，打开 **Mask Editor**，圈出要修改的区域并保存遮罩。粗选尽量闭合，包含旧物体及相关阴影；替换更大的物体时，为新轮廓留出空间。
3. 在 **VM 图像编辑 → 编辑需求**中填写要求，例如：

   > 将上衣改为深红色，保留款式、织纹和原有光照。

4. 保持 **选区方式 → 按粗选范围**、**执行方式 → 直接生成**，点击 ComfyUI 的运行按钮。
5. 在图像对比节点查看结果。**VM 图像编辑的 Final** 已连接 **保存图像（Save Image）**，生成后会自动保存到 ComfyUI 的 `output/VMNodes`，默认文件名前缀为 `VMNodes/Edit`。

图像对比和编辑节点内的预览便于检查效果，正式文件由保存节点写入。若只想预览生成结果、不写入文件，可暂时断开 Final 到保存节点的连接。

### 选择编辑范围

| 方式 | 怎么用 |
| --- | --- |
| **按粗选范围** | 画闭合粗圈，圈内作为允许编辑的范围；建议从这里开始 |
| **严格按所画遮罩** | 只编辑实际涂过的位置，要改整块区域就将其填满 |
| **整图编辑（无需遮罩）** | 上传主图、写需求后运行即可；原有遮罩会被忽略，脸部和背景也可能变化 |

只想先确认范围时，将执行方式切为 **仅预览范围**并运行。绿色表示可编辑，蓝色表示保护区；确认后切回 **直接生成**再运行。范围预览不会输出 Final，保存节点可能仍显示上次结果。

## 保留默认生成设置

示例保留外接的 Qwen 生成链，建议先用默认设置完成一次编辑：

| 设置 | 默认值 |
| --- | --- |
| 8 步 LoRA 强度 | `1.0` |
| 采样步数 | `8` |
| CFG | `1.0` |
| 采样器 / 调度器 | `euler` / `simple` |
| 降噪 | `1.0` |
| 尺寸整除 | `32` |

该示例是单图手动接线工作流，没有预接内容参考图、保护图加载器或统一示例的可选功能开关。需要这些开关时，使用[原统一编辑示例](../../../workflows/image_edit/VM_图像编辑.json)，操作见[节点说明](../nodes/image-edit.md#可选功能原统一编辑示例)。

## 可选：细化到物体

只有需要自动贴合物体轮廓时才启用：

1. 按[模型清单](../../models.json)准备可选 SAM 权重，在画布保留的 SAM 加载器中选择文件。
2. 将 SAM 加载器的 **MODEL → VM 图像编辑的 `sam_model`（SAM 模型）**，**CLIP → `sam_clip`（SAM CLIP）**。这两条线默认断开。
3. 将选区方式改为 **细化到物体**，先选择 **仅预览范围**并运行；确认范围后再切回 **直接生成**。

细化路线中的整个人物独立校验还需要模型清单里的人员检测权重，以及可选依赖。使用 ComfyUI 自己的 Python，在 ComfyUI 根目录执行：

```shell
python custom_nodes/VMNodes/install.py --person-check
```

安装后重启 ComfyUI。若提示“独立检测未确认人物”，表示自动证据不足；可主动切回按粗选范围。恢复普通编辑时，也断开上述两条 SAM 连接，避免无关模型参与加载。

## 常见问题

**导入后提示缺少 rgthree 节点？** 检查 `custom_nodes/rgthree-comfy` 是否安装成功，重启 ComfyUI 后刷新页面。图像对比和分组控制来自该插件。

**模型下拉框没有文件？** 检查文件是否放在相应模型目录及子目录，刷新列表或重启；如果使用自己的子目录，在加载器中重新选择文件即可。

**提示没有图片或遮罩为空？** 先上传图片；局部编辑还需在 Mask Editor 中画范围并保存。无需画范围时，主动选择整图编辑。

**修改后有残边或接缝？** 先检查范围是否包含旧轮廓和阴影；范围内也可能重新生成皮肤或背景。见[使用示例与效果边界](../editing-examples.md)。
