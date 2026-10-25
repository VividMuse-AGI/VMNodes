# MOSS Layout Studio acceptance / 验收记录

Verified on 2026-10-25 against the isolated source checkout prepared for this update.
The MOSS Python and JavaScript runtime files match the locally accepted installation.
The existing image-edit and resize features remain at the published repository baseline.

| Verification | Passed |
|---|---:|
| Repository Python suite | 99/99 |
| Existing frontend suite | 9/9 |
| MOSS frontend suite | 115/115 |
| Full MOSS browser suite | 108/108 |
| Center Layout browser and real queue | 12/12 |
| Megapixel browser and real queue | 11/11 |
| V2.2 picking and real reference-image queue | 22/22 |
| Live ComfyUI API suite | 32/32 |

Python tests also invoke frontend checks; the rows are separate verification scopes,
not additive totals. The development installation had 100 Python tests, including one
unrelated image-asset release test that is not part of this MOSS-only repository update.
The public package allowlist and archive build also passed. No release tag or published
ZIP was replaced. See the commit's GitHub Actions checks for remote CI status.

## Behaviors verified

- Expanding the 18-box 1152×2048 fixture to 1536×2048 in Center Layout translates
  foreground boxes 192 px horizontally without changing their size or vertical position.
  The source's 14 px character/title overlap stays unchanged.
- Reference previews retain their original footprint with neutral side margins in both
  the browser and backend. Canvas picking samples the same centered reference; blank
  margins sample the displayed canvas. Workflow reload retains reference placement.
- Smaller canvases uniformly fit the whole layout. Full-canvas object boxes continue
  to fill the canvas. Replace imports establish a fresh alignment base.
- At 2 MP, the 1152×2048 fixture becomes 1056×1888; the backend Draft retains those
  dimensions and all 18 boxes. Preview thumbnails retain the existing 1152 px long-edge cap.
- Existing JSON import, layer controls, zoom/pan, palettes and API wiring remain functional.

The megapixel browser suite had one startup timeout during parallel Chrome launches;
its complete standalone rerun passed 11/11. No implementation change was made for it.
This source-checkout pass did not repeat the native desktop EyeDropper validation;
browser fallback and API integration were rerun as listed above.

## Reproduce

Use Python 3.11+ with the package test dependencies and Node.js 22:

```shell
python -m unittest discover -s tests -v
node tests/frontend.cjs
node tests/moss_frontend.cjs
python tools/check_release.py
python tools/build_release.py
```

For browser and API checks, start a CPU ComfyUI instance with VMNodes,
comfyui-custom-scripts and comfyui-KJNodes. Set `COMFY_BASE` to that server.
Install `playwright-core` in the test environment and provide Chrome; if using a
separate module installation, set `NODE_PATH` to its parent `node_modules` directory.

```shell
node tests/moss_ui_e2e.js
node tests/moss_center_sync.cjs
node tests/moss_megapixels.cjs
node tests/moss_v22_regressions.cjs
python tests/moss_live_api.py
```

The scripts accept output-directory environment variables near the top of each file.
Keep generated workflows, screenshots and local runtime logs outside release artifacts.

## 使用提示

更新后重启 ComfyUI 并刷新页面。需要扩宽海报时：重新导入原稿，选择
`Center Layout (居中扩展，缩小时整体适配)`，再修改宽高。
切换模式不会撤销旧模式已经造成的放大，已有重叠不会自动消除，参考留白不会自动补绘背景。
