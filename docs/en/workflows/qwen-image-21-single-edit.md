# Qwen Image 2.1 single-image editing

[Back to README](../../../README.en.md) · [Node options](../nodes/image-edit.md) · [中文](../../zh/workflows/qwen-image-21-single-edit.md)

Import [Qwen-Image-2.1-Single-Image-Edit.json](../../../workflows/image_edit/Qwen-Image-2.1-Single-Image-Edit.json), upload one image, draw a region, and describe the edit to generate and save a result. You can also choose full-image editing without drawing a mask.

## Installation and models

1. Install VMNodes using the [README instructions](../../../README.en.md#installation).
2. Install [rgthree-comfy](https://github.com/rgthree/rgthree-comfy). Run the command below from the ComfyUI directory, follow that project's installation instructions, then restart ComfyUI and refresh the page. The example's `Image Comparer (rgthree)` and `Fast Groups Bypasser (rgthree)` require it.

   ```shell
   git clone https://github.com/rgthree/rgthree-comfy.git custom_nodes/rgthree-comfy
   ```

3. Prepare the four model files below and select them in the corresponding loaders. Weights are not bundled with VMNodes.
4. Use a ComfyUI version that supports `TextEncodeQwenImage21`. If that official node is missing, update ComfyUI first.

Paths are relative to `ComfyUI/models/`. You can use your own subdirectories and select the files again after importing.

| Purpose | File path | Download |
| --- | --- | --- |
| Qwen Image 2.1 model | `diffusion_models/Qwen/qwen_image_2.1_int8_convrot.safetensors` | [Comfy-Org](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/diffusion_models/qwen_image_2.1_int8_convrot.safetensors) |
| Text encoder | `text_encoders/qwen3vl_8b_int8_convrot.safetensors` | [Comfy-Org](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors) |
| VAE | `vae/Qwen/qwen_image_2.1_vae_bf16.safetensors` | [Comfy-Org](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/blob/main/vae/qwen_image_2.1_vae_bf16.safetensors) |
| 8-step acceleration LoRA | `loras/Qwen/p_qwen_image_2.1_8step_v0.1.safetensors` | [PrunaAI](https://huggingface.co/PrunaAI/Pruna-Qwen-Image-2.1/blob/main/p_qwen_image_2.1_8step_v0.1.safetensors) |

Coarse-region, strict-mask, and full-image editing do not need SAM or Ultralytics. The SAM loader remains on the canvas but is disconnected from VM Image Edit by default; ordinary editing does not require its weights.

## Your first edit

1. Upload your image in **Load Image**. The example includes no image and does not select a local input file.
2. Right-click the main image, open **Mask Editor**, outline the area to change, and save the mask. Close the outline and include the original object and relevant shadows. Leave room for a new silhouette when replacing an object with something larger.
3. Enter instructions in **VM Image Edit → Edit request**, for example:

   > Change the top to dark red. Keep its design, knit texture, and original lighting.

4. Leave **Selection → Coarse region** and **Run mode → Generate**, then click ComfyUI's Run button.
5. Inspect the result in the image comparison node. **VM Image Edit Final** is already connected to **Save Image**, which automatically saves the generated result to ComfyUI's `output/VMNodes` directory with the default prefix `VMNodes/Edit`.

The comparison node and editor previews help you inspect the result; Save Image writes the final file. To view a generated result without saving a file, temporarily disconnect Final from Save Image.

### Choose an edit region

| Mode | How to use it |
| --- | --- |
| **Coarse region** | Draw a closed rough outline; the enclosed area becomes editable. Start here |
| **Strict drawn mask** | Edits only the painted pixels; fill the region to change the entire area |
| **Full-image edit (no mask)** | Upload the image, describe the edit, and run. An existing mask is ignored; faces and backgrounds may also change |

To check the selection first, choose **Preview range only** and run. Green marks editable areas; blue marks protection. When satisfied, switch back to **Generate** and run again. Range preview emits no Final image; Save Image may still show the previous result.

## Keep the default generation settings

The example retains an external Qwen generation chain. Complete a first edit using the defaults:

| Setting | Default |
| --- | --- |
| 8-step LoRA strength | `1.0` |
| Sampling steps | `8` |
| CFG | `1.0` |
| Sampler / scheduler | `euler` / `simple` |
| Denoise | `1.0` |
| Dimension alignment | `32` |

This single-image workflow uses manual connections. It has no content-reference or protection-image loaders connected and does not include the unified example's optional-feature switches. For those switches, use the [original unified example](../../../workflows/image_edit/VM_图像编辑.json) and its [node instructions](../nodes/image-edit.md#optional-features-original-unified-example).

## Optional object refinement

Enable this only when you want automatic selection along an object's outline:

1. Prepare the optional SAM weights from the [model list](../../models.json) and select the file in the SAM loader retained on the canvas.
2. Connect the SAM loader's **MODEL → VM Image Edit `sam_model` (SAM model)** and **CLIP → `sam_clip` (SAM CLIP)**. Both connections are absent by default.
3. Choose **Refine to object** and run **Preview range only** first. Check the region, then switch back to **Generate**.

Independent whole-person verification within the refinement route also needs the person-detection weights in the model list and an optional dependency. From the ComfyUI directory, using ComfyUI's Python, run:

```shell
python custom_nodes/VMNodes/install.py --person-check
```

Restart ComfyUI afterward. An unconfirmed-person message means the automatic evidence is insufficient; you can explicitly return to Coarse region. Disconnect both SAM links again when returning to ordinary editing to avoid loading unnecessary models.

## Common questions

**Missing rgthree nodes on import?** Check that `custom_nodes/rgthree-comfy` installed successfully, restart ComfyUI, and refresh the page. Image comparison and group controls come from that plugin.

**Model missing from a dropdown?** Check its model directory and subdirectory, then refresh the list or restart. If you use a different subdirectory, select that file in the loader.

**No image or an empty mask?** Upload an image first. For a local edit, draw a region in Mask Editor and save it. To skip drawing, explicitly choose Full-image edit.

**Residual edges or seams?** Check that the region includes the old silhouette and shadows. Skin or background inside the region can also be regenerated. See [examples and result limits](../editing-examples.md).
