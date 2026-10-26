# VMNodes

[中文](README.md) | **English**

VMNodes is a growing collection of ComfyUI nodes. Install and update the package once, then use the nodes you need.

**v0.2.0 · MOSS layout update (Pre-release)**. Try it and share feedback; compatibility may vary across ComfyUI versions, hardware and extension combinations.

## Available nodes

| Node | Purpose | Guide |
| --- | --- | --- |
| **VM Image Edit** | Describe an edit, choose its region, preview it and composite the result; supports full-image editing without a mask | [Use this node](docs/en/nodes/image-edit.md) |
| **VM Image Resize & Align** | Resize images and masks together; choose interpolation and dimension alignment | [Use this node](docs/en/nodes/image-resize.md) |
| **VM MOSS Layout Studio** | In-node layouts, JSON import/export, palettes and eyedroppers, megapixel sizing and centered canvas expansion | [Use this node](docs/en/nodes/moss-layout.md) |

Image editing currently supports **Qwen Image 2.1**. Resize & Align needs no generative model and works independently. Search for `VMNodes`, or either node's English or Chinese name.

Local editing preserves original pixels outside the permitted region, while details and seams inside it still depend on the generated image. Large silhouette changes, newly revealed skin, fine hair and regular texture boundaries may look unnatural. See [examples and result limits](docs/en/editing-examples.md) for what to check.

The layout node targets **MOSS-Image**: connect `layout_prompt` to `CLIPTextEncode` and `width/height` to the latent node. Choose Center Layout to widen a poster while retaining the relative placement and size of its foreground elements.

**MOSS is included in v0.2.0**. Pull updates or download `VMNodes-0.2.0.zip`, then restart ComfyUI and refresh the page. The older `0.1.0` ZIP does not include MOSS.

### Restore a layout prompt as editable boxes

Use the toolbar's **Import JSON → Replace Canvas** to import an existing MOSS `layout_prompt`, **preview box positions, move or resize the boxes, and output the revised layout prompt**. Both Draft (`abs` + `xyxy`) and compiled layout JSON (`abs_centralized` + `yxyx`) are supported. You can inspect the layout without generating an image. Plain descriptive text contains no box coordinates and cannot reconstruct a layout.

Compared with the locally inspected official **Create Bounding Boxes + MOSS-Image Layout Prompt** pair, this removes an extra conversion from the complete layout JSON to the official box input format. The official pair accepts its own box/element data, but has no direct parser to restore boxes from a complete MOSS `layout_prompt`. In an actual API comparison using an 18-box, 1152×2048 poster, VM restored all 18 boxes with exact coordinates from a Draft with source dimensions into an empty canvas. This demonstrates layout data recovery, not superior generated image quality.

**Source dimensions matter:** a compiled `layout_prompt` may omit `width` / `height`. Before importing, add the **original canvas dimensions used to create that layout** at the JSON root, or first set the node's canvas to those dimensions. For a 1152×2048 original, use `"width": 1152, "height": 2048`, not the new size you intend to use. Restore the layout first, then change dimensions with your chosen ratio synchronization mode.

Without source dimensions, the importer interprets coordinates using the current canvas. It reports an error if the canvas is too small for the compiled box coordinates. **An import without an error does not prove that the dimensions are correct**: incorrect dimensions can still shift the boxes. Do not infer the original canvas size from the outermost box edges. Keep a Draft with dimensions for reuse; see the [MOSS guide](docs/en/nodes/moss-layout.md).

## Installation

1. Git is recommended for easier updates. Run this from the **ComfyUI directory**:

   ```shell
   git clone https://github.com/VividMuse-AGI/VMNodes.git custom_nodes/VMNodes
   ```

   For a ZIP installation, choose `VMNodes-0.2.0.zip` under **Assets** in [this repository's Releases](https://github.com/VividMuse-AGI/VMNodes/releases). `VMNodes-0.2.0.zip.sha256` provides the SHA-256 checksum. Extract the package and place its `VMNodes` folder at `ComfyUI/custom_nodes/VMNodes`. The folder must contain `__init__.py` directly, with no extra nested package directory.
2. Using **ComfyUI's Python environment**, run this from the ComfyUI directory:

   ```shell
   python custom_nodes/VMNodes/install.py
   ```

   For portable or bundled installations, replace `python` with their included Python executable.
   The installer reuses compatible OpenCV and does not automatically replace PyTorch/CUDA.
3. Restart ComfyUI and refresh the page.

That is all you need for resizing. For editing, follow the [single-image quickstart](docs/en/workflows/qwen-image-21-single-edit.md) to prepare four model files and install [rgthree-comfy](https://github.com/rgthree/rgthree-comfy), which supplies the example's image comparison and group controls. Import the [Qwen Image 2.1 single-image edit example](workflows/image_edit/Qwen-Image-2.1-Single-Image-Edit.json), upload your image, draw a region, describe the edit, and run.

The default workflow is `Qwen-Image-2.1-Single-Image-Edit.json`, using an external generation chain and 8-step LoRA settings. For reference-image and protection-mask switches, use the [unified example](workflows/image_edit/VM_图像编辑.json). The [edit guide](docs/en/nodes/image-edit.md) explains the difference.

To save images, connect **VM Image Edit Final → Save Image**. The example is already connected. Set the filename prefix on the save node; the editor itself only creates temporary previews.

Coarse-region, painted-mask and full-image edits do not need SAM or Ultralytics. Resources for optional object refinement are listed separately in the edit guide.

VMNodes is not listed in Registry / Manager. Use Git or a Releases ZIP as described above.

## Updating

Update VMNodes as one package, then restart ComfyUI and refresh its page.

- Git: run `git pull --ff-only` in a clean VMNodes branch checkout.
- ZIP: stop the relevant ComfyUI instance, back up the old directory outside `custom_nodes`, then replace it with the new `VMNodes` directory. Do not overlay stale files.
- When dependencies change, repeat the dependency installation command above.

See the [update guide](docs/en/update.md) for pinned versions and rollback. Save your own workflows in your user directory, separately from repository examples.

## Support and license

VMNodes code is MIT-licensed. Qwen Image 2.1 is separately governed by the [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE); commercial use requires separate permission under the model publisher's terms.

When reporting a problem, include VMNodes and ComfyUI versions, the error, and a reproducible workflow. Remove private images and sensitive data before sharing.

[Changelog](CHANGELOG.md) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
