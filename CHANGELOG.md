# Changelog / 更新记录

## 0.1.5 — Unreleased / 尚未公开发布

- Prepares the VividMuse-AGI/VMNodes publication destination; the public repository and online update path still need activation and validation.
- Adds Chinese/English guidance for old silhouettes, residual fabric and known limits of structural edits.
- Updates the maintainer acceptance table to distinguish package checks, real default outputs, human approval and pending online validation.
- Documentation, version/build and repository metadata only. Image algorithms, defaults, node names, ports and workflow bytes are identical to 0.1.4. The default image samples were produced by the frozen 0.1.4 ZIP.

补齐交付说明与发布信息；不是新增接缝修复。公开发布和实际安装升级仍待验收。

## 0.1.4 — Unreleased / 尚未公开发布

- Distinguishes unconfirmed people from malformed or incorrectly sized masks in optional SAM refinement; does not silently bypass person verification.
- Uses the same component-local closed-outline interpretation for ordinary coarse regions and SAM selection evidence.
- Adds Chinese/English explanations for person-check failures and checks only the target version's release date when publishing.
- No change to ordinary coarse-region output, Qwen sampling, compositing, node names, ports, sizes or workflow layout. Hair/clothing texture, sofa boundary and historical skin continuity are not claimed fixed.

修正可选细化的错误分类与轮廓解释，保持普通编辑和回贴行为；不是通用接缝修复版。

## 0.1.3 — Unreleased / 尚未公开发布

- Clarifies the separate Qwen Image 2.1 model license in Chinese/English guides.
- Documents RGB edit output, standalone RGBA resizing, 32-pixel alignment and
  conditional reuse of cached generation results.
- States optional SAM acceptance limits and explains producer-specific opacity
  versus generic audit metadata in maintainer documentation.
- Documentation and package metadata only; no image algorithm, audit schema,
  controls, node names, sizes or workflow changes. Skin-seam quality is unchanged.

补齐许可、使用边界及维护说明；不改变出图，不是肤色断层修复版。

## 0.1.2 — Unreleased / 尚未公开发布

- Audit metadata describes the actual channel count and RGB extraction without
  assigning a meaning to extra channels; existing schema 2 arrays remain compatible.
- Logs the package version, build and loaded directory once during module import.
- Clarifies Chinese/English seam-correction status and capability descriptions.
- Image processing, defaults, node contracts and workflow layout are unchanged.

修正开发审计描述与加载版本记录，明确接缝协调的能力边界；不是肤色断层修复版。

## 0.1.1 — Unreleased / 尚未公开发布

- Opt-in developer audit now preserves decoded Pre as float32 BHWC, its original
  tensor dtype, and the existing RGB8 data, so precision differences can be replayed.
- Normal image output, boundary harmonization, node controls and workflow layout
  are unchanged. This is an audit fix, **not a skin-seam quality fix**.

开发审计补充量化前的 Pre 和精度说明；普通出图及节点使用方式不变。
V54 接缝候选未通过通用验收，因此未替换默认协调算法。

## 0.1.0 — Unreleased / 尚未公开发布

- Package-level installation and updates; editing and resize/alignment remain separate nodes.
- Preserves six node type IDs, port contracts and workflow layout.
- Makes independent person verification optional; ordinary edits/resizing do not require Ultralytics.
- Reuses compatible host OpenCV variants during installation instead of adding a second cv2 distribution.
- Isolates feature import failures with explicit diagnostics; prevents duplicate frontend setup.
- Adds Chinese/English guides, MIT licensing, local packaging and release checks.

统一 VMNodes 安装与更新入口，保留原节点名称、尺寸和工作流兼容；新增中英文说明、MIT 许可证及发布检查。

Restart ComfyUI and refresh its page after updating. Existing manual installs
require the one-time migration in [the update guide](docs/en/update.md).
No change to Qwen generation or compositing algorithms is intended in this version.
