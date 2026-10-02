# VMNodes

[中文](README.md) | **English**

VMNodes is a growing collection of ComfyUI nodes. Install and update the package once, then use the nodes you need.

## Available nodes

| Node | Purpose | Guide |
| --- | --- | --- |
| **VM Image Edit** | Describe an edit, choose its region, preview it and composite the result; supports full-image editing without a mask | [Use this node](docs/en/nodes/image-edit.md) |
| **VM Image Resize & Align** | Resize images and masks together; choose interpolation and dimension alignment | [Use this node](docs/en/nodes/image-resize.md) |

Image editing currently supports **Qwen Image 2.1**. Resize & Align needs no generative model and works independently. Search for `VMNodes`, or either node's English or Chinese name.

Local editing preserves original pixels outside the permitted region, while details and seams inside it still depend on the generated image. Large silhouette changes, newly revealed skin, fine hair and regular texture boundaries may look unnatural. See [examples and result limits](docs/en/editing-examples.md) for what to check.

## Installation

1. Place this package at `ComfyUI/custom_nodes/VMNodes`, with `__init__.py` directly inside it.
2. Using **ComfyUI's Python environment**, run this from the ComfyUI directory:

   ```shell
   python custom_nodes/VMNodes/install.py
   ```

   For portable or bundled installations, replace `python` with their included Python executable.
   The installer reuses compatible OpenCV and does not automatically replace PyTorch/CUDA.
3. Restart ComfyUI and refresh the page.

That is all you need for resizing. For editing, follow the [edit guide](docs/en/nodes/image-edit.md) to prepare models and import the [example workflow](workflows/image_edit/VM_图像编辑.json). Replace its image placeholders with your own uploads.

Coarse-region, painted-mask and full-image edits do not need SAM or Ultralytics. Resources for optional object refinement are listed separately in the edit guide.

This is an initial release candidate, **0.1.7**, installed from a local ZIP. The planned public repository is `VividMuse-AGI/VMNodes`; that repository, online installation and Registry / Manager listing are not available yet.

To save images, connect **VM Image Edit Final → Save Image**. The example is already connected. Set the filename prefix on the save node; the editor itself only creates temporary previews. Older workflows also need a save node after upgrading.

## Updating

Update VMNodes as one package, then restart ComfyUI and refresh its page.

- Git: run `git pull --ff-only` in a clean VMNodes branch checkout.
- ZIP: stop the relevant ComfyUI instance, back up the old directory outside `custom_nodes`, then replace it with the new `VMNodes` directory. Do not overlay stale files.
- When dependencies change, repeat the dependency installation command above.

See the [update guide](docs/en/update.md) for migration from older image-edit packages, pinned versions and rollback. Save your own workflows in your user directory, separately from repository examples.

## Support and license

VMNodes code is MIT-licensed. Qwen Image 2.1 is separately governed by the [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE); commercial use requires separate permission under the model publisher's terms.

When reporting a problem, include VMNodes and ComfyUI versions, the error, and a reproducible workflow. Remove private images and sensitive data before sharing.

[Changelog](CHANGELOG.md) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
