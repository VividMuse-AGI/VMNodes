# Maintaining and releasing VMNodes

The repository root is the ComfyUI plugin root. One package version covers all
features. `pyproject.toml` is the version source; `version.py` reads it without
importing heavyweight dependencies. Preserve the six existing class IDs and
workflow serialization contracts when adding features.

Run with Python 3.11+ (tooling requirement; no broad host compatibility claim):

```shell
python tools/check_release.py
python -m unittest discover -s tests -v
node tests/frontend.cjs
python tools/build_release.py
```

The Python tests use minimal host substitutes unless `VMN_COMFY_ROOT` names a real
ComfyUI checkout. Substitute-based tests cover CPU behavior, not host startup or
model quality. Run real-host validation before release. CI configuration is not
evidence that remote CI has already run.

## Public-release gates

1. Set `[project.urls].Repository` to the actual GitHub repository. For Registry,
   also set `[tool.comfy].PublisherId` after the owner creates that identity.
2. Confirm package ID availability and owner identity. Review third-party terms.
3. Finalize CHANGELOG's date and update README installation status/links.
4. Run checks and inspect the ZIP file list. `release_files.json` is an explicit
   allowlist; add new runtime modules and user docs deliberately.
5. Commit reviewed changes and run `python tools/check_release.py --public`.
   For Registry also use `--registry`. Missing metadata deliberately blocks release.
6. Tag that exact commit `vX.Y.Z`. The manual Release workflow requires a matching
   tag, runs checks and creates a **draft** GitHub Release. Review before publishing.
7. Registry publication remains a separate explicit owner action from that same
   clean tagged commit: `comfy node publish`. Configure credentials through the
   CLI's secure prompt, never source files. Verify Manager installation afterwards.

Registry normally packages Git-tracked files; `.comfyignore` removes development
files. See the [official publishing instructions](https://docs.comfy.org/registry/publishing)
and [metadata specification](https://docs.comfy.org/registry/specifications).

## Boundaries

- No model downloads, pip installs or workflow migrations run on plugin import.
- `install.py` is the separate installation entry. It reuses any working OpenCV
  variant >=4.8. If absent, it installs the fallback wheel without dependency
  replacement; optional Ultralytics uses the same `--no-deps` rule. Broken or old
  existing packages produce an actionable error, not an automatic overwrite.
  A clean environment may need additional optional Ultralytics dependencies;
  that path is not claimed to be a fully automatic fresh installation.
  OpenCV variants share `cv2` and should not be installed together; see the
  [upstream packaging guidance](https://github.com/opencv/opencv-python).
- Feature import failures are logged with tracebacks and exposed in `IMPORT_ERRORS`.
- The person-check loader respects a preexisting `YOLO_CONFIG_DIR` or already
  imported Ultralytics. Otherwise it uses new/legacy user data for initial import,
  then restores the environment. Ultralytics still caches process-wide settings:
  this is not full isolation from another plugin importing it concurrently.
- Old confirmation/audit directories are not migrated in this packaging release.
- Keep research records and private media outside this repository. No sample image
  is bundled; the template deliberately prompts users to upload their own image.
- First-stage packaging retains flat Python and JS paths. New feature modules can
  be added through explicit registration without a filesystem-scanning framework.

## Fixed-input precision audits

When explicitly diagnosing compositing, `VM_IMAGE_EDIT_AUDIT=1` enables private
audit files; `VM_IMAGE_EDIT_AUDIT_DIR` selects their directory. Keep these image
arrays outside the repository and release archive. Normal runs do not write them.
Schema 2 retains `pre` (the compositor's rounded RGB8 input) and adds
`pre_float32` (BHWC, all source channels before RGB extraction), `pre_tensor_dtype`,
layout and quantization descriptions. Metadata revision 1 additionally records
`pre_channel_count`, `pre_rgb_channel_indices` and `pre_extra_channel_semantics`.
Only channels 0, 1 and 2 are used for RGB compositing. Extra channels are retained
for diagnosis. The generic input has no verified producer identity, so the metadata
reports unknown semantics; channel count alone does not establish alpha or a [0,1] range.
These fields are optional for older schema 2 archives. Metadata revision is included
only in audit filenames, not in normal image or generation cache keys.
Float16/bfloat16 values are exactly representable in
float32; this is not a claim of preserving hypothetical float64 inputs.
Audit filenames include the float data and original dtype so two distinct Pre
tensors with the same rounded RGB8 pixels do not overwrite one another.
Source/context images and masks still follow their existing stored precision.
Standard SaveImage PNGs may truncate where VMNodes rounds, so label PNG-only
replays as RGB8 tests, not exact reconstructions of historical float tensors.
The extra float32 array uses H × W × C × 4 bytes for a single image (12 bytes per
pixel for RGB, 16 for four channels), plus compression buffers and other temporary
arrays, only when auditing is enabled. Archive schema 1 remains readable by
checking for optional keys. Do not interpret a saved float array as evidence
that every stage of the compositor operates in float precision.

For an independently verified Qwen Image 2.1 VAE → VAEDecode → generated_pre
route, the fourth channel represents generated opacity. The
[official VAE configuration](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/vae/config.json)
and [ComfyUI adapter](https://github.com/Comfy-Org/ComfyUI/blob/v0.37.4/comfy/sd.py#L775)
document this route. Record producer evidence alongside the private audit rather
than relabeling arbitrary four-channel tensors based on their shape or a filename.
Generated opacity and VMNodes' effective_alpha have different purposes: the latter
controls edit scope and protection. Do not multiply them together as a metadata fix.
No runtime audit schema or compositing behavior changes in 0.1.3.

## Current acceptance scope

The prior 0.1.2 baseline was exercised with ComfyUI 0.37.4 and frontend 1.52.7.
The 0.1.3 changes are documentation and package metadata only. Do not describe
prior real-host evidence as a new 0.1.3 model run. SAM inference, transparent-edit
delivery, broader host compatibility and user visual acceptance remain unconfirmed.

Frontend 1.52.7 expands undersized nodes during import via
[computeSize and setSize](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.52.7/src/scripts/app.ts#L1350).
Preserving workflow bytes is not proof that every initial on-screen size is identical.
Do not force global node sizes, rename nodes or collapse them to hide that limitation.

