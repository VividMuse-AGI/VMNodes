# VMNodes

[中文](README.md) | **English**

VMNodes is a growing collection of ComfyUI nodes. Install and update the package once, then use the nodes you need.

**v0.3.0 · MOSS V2.3 layout update**. [Download the release](https://github.com/VividMuse-AGI/VMNodes/releases/tag/v0.3.0). Compatibility may vary across ComfyUI versions, hardware and extension combinations.

**MOSS V2.3** adds composition guides, an expanded text inspector and external text inputs, included in the `v0.3.0` package. V2.3 names the MOSS feature iteration; `v0.3.0` is the VMNodes package release version.

## Available nodes

| Node | Purpose | Guide |
| --- | --- | --- |
| **VM Image Edit** | Describe an edit, choose its region, preview it and composite the result; supports full-image editing without a mask | [Use this node](docs/en/nodes/image-edit.md) |
| **VM Image Resize & Align** | Resize images and masks together; choose interpolation and dimension alignment | [Use this node](docs/en/nodes/image-resize.md) |
| **VM MOSS Layout Studio** | In-node layouts, JSON import/export, palettes and eyedroppers, megapixel sizing and centered canvas expansion | [Use this node](docs/en/nodes/moss-layout.md) |

Image editing currently supports **Qwen Image 2.1**. Resize & Align needs no generative model and works independently. Search for `VMNodes`, or either node's English or Chinese name.

Local editing preserves original pixels outside the permitted region, while details and seams inside it still depend on the generated image. Large silhouette changes, newly revealed skin, fine hair and regular texture boundaries may look unnatural. See [examples and result limits](docs/en/editing-examples.md) for what to check.

The layout node targets **MOSS-Image**: connect `layout_prompt` to `CLIPTextEncode` and `width/height` to the latent node. Choose Center Layout to widen a poster while retaining the relative placement and size of its foreground elements.

**MOSS V2.3 is included in v0.3.0**. Pull updates or download `VMNodes-0.3.0.zip`, then restart ComfyUI and refresh the page. The older `0.1.0` ZIP does not include MOSS.

### MOSS V2.3: ready-to-import example

[Download example JSON](https://raw.githubusercontent.com/VividMuse-AGI/VMNodes/v0.3.0/workflows/moss/MOSS-V2.3-Layout-Studio.json) · [View workflow file](workflows/moss/MOSS-V2.3-Layout-Studio.json) · [V2.3 acceptance report (Chinese)](https://github.com/VividMuse-AGI/VMNodes/blob/main/tests/MOSS_V2.3_%E9%AA%8C%E6%94%B6%E6%8A%A5%E5%91%8A.md)

The example contains a **five-box, 896×1152** botanical exhibition poster layout: background, character, title, subtitle and event details. It uses only **VMNodes and built-in ComfyUI nodes**, with no model downloads, reference images or additional node packs. Run it to see the box preview and `layout_prompt` JSON. The preview is a layout diagram, not an AI-generated poster.

1. Install or update to `v0.3.0`, restart ComfyUI and refresh the page. For Git, follow the update instructions below. For ZIP installations, use the [v0.3.0 installation package](https://github.com/VividMuse-AGI/VMNodes/releases/download/v0.3.0/VMNodes-0.3.0.zip). The older `v0.2.0` Release ZIP does not contain V2.3.
2. Download the example JSON and drop it onto ComfyUI, or open it through the workflow menu. **This is a complete workflow file: do not paste it into the MOSS toolbar's Import JSON dialog.**
3. Click Run. Two **Text (Multiline)** nodes on the left feed `global_prompt_in` and `box_texts_in`; the right side shows the layout preview and compiled JSON. Use **中文 | EN** in the layout toolbar to switch the editor to English.
4. Edit `T1: NIGHT GARDEN | ...` on the left and run again to update the title and style in the canvas. `T1/T2/T3` address text boxes, `C1` the character and `O1` the background; a literal `\n` becomes a line break.
5. Click a layer row's **⤢** to open the text inspector, drag boxes to adjust placement, and toggle **📐 Thirds / 🔱 Golden** for alignment. Guides are editor overlays and do not enter the output JSON or backend preview image. The top global caption field also supports vertical resizing.

**Text precedence:** while `box_texts_in` is connected, every run replaces its corresponding fields with the external text, even when the upstream value has not changed. Disconnect `box_texts_in` to keep manual inspector edits, or make the same edits in the left text node. A nonempty `global_prompt_in` also overrides the node's local global caption. Neither text input changes box positions.

![MOSS V2.3 example: external text inputs, expanded inspector, guides and layout output](https://raw.githubusercontent.com/VividMuse-AGI/VMNodes/v0.3.0/docs/images/moss-v23-workflow.jpg)

Verified with ComfyUI **0.43.0 / frontend 1.57.4**, including browser import, real execution and editing after backfill: [21 checks](https://github.com/VividMuse-AGI/VMNodes/blob/main/tests/evidence/moss_v23_example_20261027/checks.json). Update ComfyUI if `PrimitiveStringMultiline` or `PreviewAny` is missing. To generate an image, connect `layout_prompt` to your MOSS text encoder and `width/height` to the corresponding latent dimensions, and supply the MOSS models and sampling chain separately.

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

   For a ZIP installation, choose `VMNodes-0.3.0.zip` under **Assets** in [this repository's Releases](https://github.com/VividMuse-AGI/VMNodes/releases). `VMNodes-0.3.0.zip.sha256` provides the SHA-256 checksum. Extract the package and place its `VMNodes` folder at `ComfyUI/custom_nodes/VMNodes`. The folder must contain `__init__.py` directly, with no extra nested package directory.
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
