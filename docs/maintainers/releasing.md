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
2. Confirm repository ownership/access and review third-party terms. Registry
   publication additionally requires an available package ID and publisher identity.
3. Finalize CHANGELOG's date and update README installation status/links.
4. Run checks and inspect the ZIP file list. `release_files.json` is an explicit
   allowlist; add new runtime modules and user docs deliberately.
5. Commit reviewed changes and run `python tools/check_release.py --public`.
   For Registry also use `--registry`. Missing metadata deliberately blocks release.
6. Tag that exact commit `vX.Y.Z`. Dispatch the manual Release workflow from that
   tag. It runs checks and creates a **draft Pre-release**, using
   `docs/releases/X.Y.Z.md` and only the matching ZIP and SHA-256 assets. Review
   the draft before publishing. For a future stable release, deliberately review
   the workflow's Pre-release flag and release wording.
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

Acceptance records as of 2026-10-03 are maintained outside the public package.
Research IDs identify those records; they are not extra product modes.

| Evidence | Version and environment | Supported conclusion | Limit |
| --- | --- | --- | --- |
| Earlier host baseline | 0.1.2; ComfyUI 0.37.4 / frontend 1.52.7 | Historical host behavior | Not a new 0.1.3 or 0.1.5 model run |
| V91 optional SAM | 0.1.4; four real range-preview cases | Error classification and some real previews; three previews succeeded | Ring-shaped object failed person verification; not broad refinement or generation acceptance |
| V106 package and UI | 0.1.4; ComfyUI 0.38.1 / frontend 1.53.6 | Clean ZIP extraction, 16 package/install tests, actual startup, example import, zh/en/auto language and local upgrade simulation | Existing host Python reused; not a new dependency environment or actual user upgrade |
| V107 default replay | 0.1.4; same recorded host | Prior M02 default Final and generation inputs reproduced exactly | Reproducibility does not make a failed image usable |
| V107 low-denoise candidate | 0.1.4; two fixed 0.80 outputs | Parameter was effective; both edits were incomplete and rejected by the user | Closed research route, not a default change |
| V108 default coverage | Exact 0.1.4 ZIP; ComfyUI 0.38.1 / frontend 1.53.6 | Two executions; outside/protected/reconstruction/alpha-overrun counts all zero. Human: skirt usable; fitted top target complete but unusable because of residual fabric | Fixed-case acceptance, not a general success rate |
| V110/V112 offline diagnosis | Frozen 0.1.5 compositor and earlier fixed generated tensors | Corrected coverage reduced a fragment; Strict drawn mask reduced blending at permitted pixels. Some old fabric remained outside permission. Skirt mode comparison showed no obvious assistant-observed regression | No new Qwen runs; top repair failed. Do not substitute assistant ratings for unavailable human feedback |
| V114 delivery | Exact 0.1.6 candidate ZIP; ComfyUI 0.38.1 / frontend 1.53.6 | 16 package/install tests, clean imports, isolated 0.1.3 → 0.1.6 → 0.1.3 replacement, actual startup and workflow import, zh/en/auto controls | Existing host Python reused; no image inference, online validation or actual user installation replacement |
| V115 separate saving | 0.1.7; ComfyUI 0.38.1 / frontend 1.53.6 | 27 CPU tests, 9 frontend checks, 5 real executor cases; standard Save Image pixels/metadata, preview blocking, no-save mode, old workflow loading, real PNG import and temporary preview display | Fixed synthetic Pre; no new model generation or image-quality acceptance |
| V118 original-LoRA comparison | 0.1.7; eight real Qwen runs across two fixed cases and two mask variants | Original 8-step LoRA and no-LoRA routes executed; outside-region changes were zero and saved pixels matched Final | No consistent quality advantage established; no second seed or new broad human acceptance |
| V119 default single-image example | 0.1.7; ComfyUI 0.38.2 / frontend 1.53.6, host with no SAM/checkpoint files | Real browser import, one GPU generation, preview blocking and PNG workflow import; Final reproduced the recorded original-LoRA baseline exactly; original node appearance fields preserved | Existing host Python and model files reused; one fixed generation, not a fresh dependency environment or new quality acceptance |

The V108 archive SHA256 is
`17795672c927abc125ca34087782d73b8f7085ada74ad2e1077291b18cb35fd4`.
0.1.5 changes only documentation, version/build and repository metadata. Reuse
the unchanged-runtime evidence with its original identity; do not call the two
0.1.4 samples new 0.1.5 model runs. New package checks must use the new ZIP identity.
The user's separate local installation was backed up and upgraded to 0.1.7 on
2026-10-02, as recorded in V115 section 7. That local replacement is separate
from GitHub installation and remote update validation.

Structural edits, new skin, hair/fabric textures and cushion boundaries retain
known visual failures. Single-main-image RGB editing with optional content
references and Qwen Image 2.1 is the delivery scope. Multi-main-image editing,
transparent editing and other model backends are not accepted capabilities.
Full fresh-environment installation, wider host compatibility, remote CI,
online installation/update and Registry / Manager remain pending.

The intended repository is `VividMuse-AGI/VMNodes`. The account page was reachable
on 2026-10-02, while the unauthenticated repository page returned 404. That does
not rule out a private repository. Treat the metadata URL as a publication
destination until authenticated creation/access and remote checks are complete.
The 0.1.7 materials are finalized as a first public Pre-release dated 2026-10-03.
This local document date and a successful URL syntax check do not prove that the
repository, tag or Release is online. Record authenticated remote access, pushed
commit/tag, CI result and published asset checks separately when publication occurs.

## 0.1.7 material freeze

The default example is `Qwen-Image-2.1-Single-Image-Edit.json`. It preserves the
owner's original node IDs, titles, positions, sizes and expansion state, with
the original 8-step LoRA at strength 1. Its optional SAM loader is disconnected
and has an empty model selection so ordinary editing imports without SAM files.
Personal input paths and cached previews are cleared. The earlier unified
example remains available for reference/protection switches.

Finalizing documentation does not change the runtime build identity
`0.1.7+20261002.r1`. Compare runtime and workflow hashes with V119 when reusing
its real-host evidence. Each final archive still needs its own manifest and
SHA-256 validation. Keep the release receipt outside the public package.

## Image-quality freeze and delivery work

As of 2026-10-02, the owner has ended the recent quality-tuning route and chosen
delivery stabilization. Keep image algorithms, defaults, user node IDs, titles,
ports, dimensions and expansion state unchanged. The owner subsequently approved
separate saving in 0.1.7: the example adds one standard Save Image node and a link
from Final. All earlier nodes and links remain intact except that added connection.
Do not
promote experimental masks, narrow transitions, color corrections or lower
denoise into defaults. Version 0.1.6 adds usage documentation and metadata only;
its new build identity can invalidate caches without changing the image algorithm.

In 0.1.7 the editor writes preview files under ComfyUI's temporary directory, using
UI image type `temp`. The legacy filename_prefix field remains in the schemas and
serialized widget positions but is hidden and ignored for preview paths. Older
workflows must connect an external save node for persistent output. Keep Final
blocked in range-preview mode; never substitute the mask visualization there.
Standard Save Image preserves prompt/workflow metadata when host metadata is
enabled. It does not copy the editor's custom `vmnodes` PNG diagnostic chunk;
that chunk remains on the temporary preview. Do not treat it as durable audit
storage or rely on temporary previews surviving a later host session.

Keep technical acceptance separate from visual usability. Missing edit permission
and inward blending can both leave old fabric; neither is a reason to bypass
permission checks. A narrower transition is not a general repair. Archive failures
without claiming they were resolved, and retain previously accepted cases.

Further image-quality work needs new evidence of a reusable capability or a
repeated real-user problem, a bounded experiment, and a no-regression criterion.
Another feather radius, seed, or case-specific mask is not sufficient reason to
restart the closed tuning loop. Installation faults and reproducible implementation
errors remain normal maintenance tasks.

Validate each new delivery ZIP independently: manifest, clean extraction, actual
host imports, documented local upgrade and rollback, and preservation of user
workflows. Local filesystem/Git simulations are not remote CI or online update
evidence. The private delivery record contains package identities and logs; do not
copy private evaluation media or absolute machine paths into the public package.

Frontend 1.52.7 expands undersized nodes during import via
[computeSize and setSize](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.52.7/src/scripts/app.ts#L1350).
Preserving workflow bytes is not proof that every initial on-screen size is identical.
Do not force global node sizes, rename nodes or collapse them to hide that limitation.

V106 also observed automatic height normalization of the two undersized built-in
nodes in frontend 1.53.6. The workflow bytes, VM node names and original layout
remain preserved. Do not change the host to force those built-in nodes shorter.

