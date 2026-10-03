# VM Image Edit

[Back to README](../../../README.en.md) · [中文](../../zh/nodes/image-edit.md)

Start with the [Qwen Image 2.1 single-image edit example](../../../workflows/image_edit/Qwen-Image-2.1-Single-Image-Edit.json). Follow the [single-image quickstart](../workflows/qwen-image-21-single-edit.md) to install dependencies, select models, and upload one main image.

The default example has an external generation chain with editing and saving already connected. The reference-image and protection-mask switches under Optional features below belong to the [original unified example](../../../workflows/image_edit/VM_图像编辑.json). Those switches and their image loaders are not included in the default single-image example.

## Models

The default single-image example needs four files: Qwen Image 2.1, its text encoder, VAE, and 8-step acceleration LoRA. See the [quickstart](../workflows/qwen-image-21-single-edit.md) for paths and download links, then select your files in the workflow. Weights are not bundled. Install [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) for the example's comparison and group controls. Use a ComfyUI version with the required official model nodes.

Qwen Image 2.1 uses the [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE). Commercial use requires a separate model license; VMNodes' MIT license does not cover the model.

Ordinary edits do not need SAM. The default example retains the SAM loader but leaves it disconnected. Refine to object requires connecting it as described in the [quickstart](../workflows/qwen-image-21-single-edit.md#optional-object-refinement). Independent whole-person verification within that route additionally needs the person model in the [model list](../../models.json) and an optional dependency. From ComfyUI's directory, using its Python:

```shell
python custom_nodes/VMNodes/install.py --person-check
```

Restart after installation. Other editing modes do not require it. Dependencies and models retain their own licenses.
If the installer reports another missing dependency, resolve that component in your ComfyUI environment. It does not replace existing OpenCV or PyTorch automatically.

Refine to object is optional. Real previews have been tested, but not every object can be identified reliably. An unconfirmed-person message means the automatic evidence is insufficient, rather than an image-size error. You can explicitly select Coarse region; the node does not silently bypass verification. Start with Coarse region or Strict painted mask for ordinary use.

## Your first edit

### Change part of an image

1. Upload your image on the left of the workflow.
2. Right-click the image, open **Mask Editor**, draw a rough outline around the area to change, and save the mask.
3. Enter your instructions in **VM Image Edit → Edit request**.
4. Leave **Selection** on **Coarse region** and **Run mode** on **Generate**, then run the workflow.

For example:

> Change the top to dark red. Keep its design, knit texture, and original lighting.

You do not need to trace the edges perfectly, but try to close the outline and include the entire target. Include shadows when removing an object, and leave room for the new silhouette when replacing it with something larger.

When shortening a skirt or narrowing clothing, include the old silhouette and the background that must be revealed. Selecting only the new silhouette can leave old fabric behind. Check areas near hands, cuffs and occlusion boundaries in the preview.

Clothing, skin or background included inside the region may also be regenerated. Start by covering the whole target; extra expansion and a protection image are not always necessary. Regular textures and fine hair boundaries may still change: the node does not guarantee preservation of every unrelated detail inside a coarse selection.

### Edit without drawing a mask

Upload your image, choose **Full-image edit (no mask)**, describe the change, and run. You can leave an existing edit mask in place: this mode ignores it, and it remains available when you switch back to local editing.

For example:

> Restyle the loose hair into a natural high ponytail. Keep the original hair color and naturally complete the clothing revealed beneath it.

Full-image editing is useful when surrounding content needs to change together with the target. It may also subtly change faces, clothing textures, or the background. Use local editing when you want to restrict where changes can occur.

## Save or continue processing the result

Connect **VM Image Edit Final → Save Image**. The example already includes this connection and saves to ComfyUI's `output/VMNodes` folder. Set the subfolder and filename prefix on Save Image.

The editor's preview is temporary and does not automatically write to `output`. To view without saving, leave out Save Image or connect Final to Preview Image. You can also process Final with other image nodes before saving.

Preview range only emits no Final image, so the example's save node will not save a green/blue overlay as the final result. To save a range visualization intentionally, connect Range preview to a separate save node.

In range-preview mode, Save Image may still display its previous image. This does not mean a new Final was saved.

## VM Image Edit: what each option does

### Selection

| Option | What it does | When to use it |
|---|---|---|
| **Coarse region** | Makes the area inside a closed outline available for editing | Everyday local edits; the recommended starting point |
| **Full-image edit (no mask)** | Edits the whole image from your instructions without a drawn region | Restyling hair, completing previously hidden content, or skipping mask drawing |
| **Strict drawn mask** | Edits only the locations you actually paint | Small repairs; fill the area to edit it all, since an empty outline selects only the brush strokes |
| **Refine to object** | Identifies an object near your rough selection and fits the region to its outline | When you want help following object edges; requires SAM and should be previewed first |

### Main controls

| Control | What it does and how to use it |
|---|---|
| **Edit request** | Describe what to change, what it should become, and what you want to keep. No fixed wording is required |
| **Run mode → Generate** | Produces the edited image |
| **Run mode → Preview range only** | Shows the selection without generating an edit. Switch back to Generate and run again when ready |
| **Show preview / Hide preview** | Opens or closes the separate viewer for the last result. Clicking it does not run the workflow |
| **Seam harmonization → Auto** | Tries to reduce slight color differences along local edit edges. Start with Off; it is not used for full-image edits |
| **Language** | Follows ComfyUI automatically, or uses Chinese or English. It does not translate your edit request |

**Reading the range preview:** green means editable, and blue means protected. In full-image mode, the border indicates that the whole image is editable; it does not predict where the model will make changes. Run again after changing settings to update the preview.

Automatic correction does not guarantee matching colors after clothing changes or in newly revealed areas. “Local correction applied” means some pixels were adjusted; check the actual seam.

### Optional features (original unified example)

These switches belong to the [original unified example](../../../workflows/image_edit/VM_图像编辑.json). The default single-image example uses a manually connected generation chain and does not include these switches or their image loaders. Import the original unified example if you need them. In that example, leave them off unless you need a reference image or a protected area.

| Feature | Purpose | How to use it |
|---|---|---|
| **Content reference** | Borrows an item's appearance, material, or style from another image | Select it under Reference mode, upload the reference in the corresponding node below, and describe what to reference |
| **Use protection mask** | Preserves an area you do not want changed, such as a face or text | Load the same main image in the protection image node, clear any existing mask, and paint the area to keep |
| **Mask guidance (experimental)** | Gives the model an extra visual cue about the edit region | Optional for local edits; improvement is not guaranteed, and full-image mode does not support it |

Example request with a reference:

> Image 1 is the main image. Replace the vase on the table with the vase from image 2, matching the lighting in image 1. Use image 2 only as a reference for the vase's appearance.

Protection takes priority over editing. Writing “keep the face unchanged” alone does not guarantee preservation; use a protection mask when you need to retain the original pixels. A seam may still appear where the protected area meets new content.

## Common questions

**What should I do if the mask is empty?** For local editing, draw a region on the main image and save it. To edit without drawing, explicitly choose Full-image edit (no mask).

**Why are some original colors, strands of hair, or shadows left behind?** Preview the region and check for missed parts of the old target or its shadow. Content outside the selection stays unchanged; changing selection mode or seam harmonization cannot repair missing coverage. Where the old target touches hands, hair or patterned fabric, residual edges or seams may remain even with complete coverage. Do not keep expanding the region indefinitely. Full-image editing permits surrounding changes but is not guaranteed to improve the result. See [examples and result limits](../editing-examples.md).

**Does Strict drawn mask always produce cleaner edges?** No. It uses the painted pixels and does not turn an empty outline into a filled selection. It also cannot remove fragments outside that selection. Choose the mode for the task, rather than treating a mode switch as a universal edge repair.

**Why did the face or background change outside my intended edit?** Full-image mode allows changes throughout the image. Use local editing to restrict the area. For an additional protection mask, follow the original unified example instructions above.

**Can I edit several main images at once?** Each run processes one main image. The original unified example can also use one content reference; the default single-image example has no reference input connected. Run separate jobs for multiple main images.

**Can I edit transparent images?** The current edit output is RGB and does not preserve transparency. Do not use this node as a complete RGBA editing pipeline. Standalone resizing can retain an input image's fourth channel.

**Does switching seam harmonization regenerate the image?** Generation can be reused when upstream inputs are unchanged and cached results remain available. Changing the prompt, seed or other upstream settings, restarting, or losing the cache may require generation again.

**How do I find the nodes or restore a workflow?** Search for `VMNodes`. Drag a PNG saved by standard Save Image back into ComfyUI to restore its workflow, provided image metadata is enabled. Keep the original inputs, reference images, and model files available.
