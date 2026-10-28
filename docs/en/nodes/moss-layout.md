# VM MOSS Layout Studio

[Home](../../../README.en.md) · [中文](../../zh/nodes/moss-layout.md)

Draw and label a poster or infographic layout on an in-node canvas, compile it into the
MOSS-Image layout prompt, and bring `moss-image-prompt-enhancer` JSON back onto the canvas
for another pass.

No generation model is required to use the node; connect MOSS-Image's `CLIPTextEncode`
when you actually want an image.

## Quick start

1. Add **VM MOSS Layout Studio** (search `MOSS`, `layout` or `poster`).
2. Pick a size preset, or use `Custom` and type the width/height (snapped to 16).
3. Use `+ Text / + Character / + Object`, or double-click an empty canvas area.
4. Write the global caption and fill in the per-box text and style/caption fields.
5. Connect `layout_prompt` to `CLIPTextEncode` (MOSS), `width/height` to `EmptyLatentImage`,
   and `preview_image` to `Preview Image`.

> Turn **Prompt Upsampler** off before running: the layout prompt is machine-readable JSON.

## Ports

| Input | Description |
|---|---|
| `ui_language` | `中文 (ZH)` / `English (EN)`; also drives the `[中文 \| EN]` switch |
| `canvas_preset` | Size preset; `Custom` uses the width/height widgets |
| `width` / `height` | Custom size, aligned to a multiple of 16 before compiling |
| `bbox_ratio_sync` | `Smart` / `Keep Box Aspect` / `Stretch with Canvas` / `Center Layout` |
| `scene_meta` | First `summary.meta` tag; `none` omits meta entirely |
| `canvas_layout_type` | `single` / `multi_panel` / `collage` → `summary.canvas` |
| `layer_order_mode` | `Auto` (background → object → character → text) / `Manual` |
| `global_prompt` | Global caption → `summary.caption` |
| `layout_data` | Canvas state maintained by the frontend |
| `ref_image` (optional) | Backdrop reference; shown on the canvas, never sent to the prompt |
| `global_prompt_in` (optional) | External global caption: overrides `summary.caption` when non-empty and is mirrored back into the widget |
| `box_texts_in` (optional) | External per-box copy: `T1: title \| style` labels or plain lines for the Text boxes in order |
| `external_layout_json` (optional) | Skill draft / compiled JSON / plain caption |
| `external_sync_mode` (optional) | `Ignore` / `Replace Canvas` / `Merge into Canvas` |
| `custom_meta_tags` (optional) | Extra comma-separated meta tags |

| Output | Description |
|---|---|
| `layout_prompt` | Model input (`abs_centralized` + `yxyx`); plain caption when empty |
| `draft_json` | Readable draft (`abs` + `xyxy`) that can go back into the Skill |
| `preview_image` | Coloured boxes with `T1/C1/O1` tags, z-order and literal text |
| `width` / `height` | Final aligned canvas size |

## Size presets

Portrait 3:4 and 2:3, mobile 9:16, long-form 1:2, A4 print ratio, square 1:1, and
landscape 4:3 / 3:2 / 16:9 / 21:9, each in standard and HD where it applies. The design
prose says “16 groups” but its canonical list contains 17 (the landscape group has five);
this node implements every named preset.

All presets are multiples of 16. Typed sizes are snapped (for example `1001×777` →
`1008×784`) and the same size is used by the outputs, the preview and the bboxes.

### Resize by total pixels

Enter a target in **Total pixels (MP)** below the toolbar and click **Apply** or press Enter.
1 MP is one million pixels. The current canvas ratio is preserved with each side rounded to a
multiple of 16; the actual size and MP appear alongside. For example, 1152×2048 at 2 MP becomes
1056×1888 (about 1.994 MP).

Applying switches the preset to Custom and uses Aspect Sync for existing boxes. Select a preset
or import JSON first, then apply your MP target. The target is saved in the workflow. Subsequent
preset changes or Replace imports use their own dimensions; click Apply again when needed.
The controls are disabled when width or height is linked.

Input accepts 0.01–32 MP, but resulting sides must remain within 256–4096. Invalid targets leave
the layout unchanged. Generation uses the normal width/height outputs connected to the latent node.

### Center Layout sync

Aspect Sync now includes `Center Layout (居中扩展，缩小时整体适配)`.

Import the original layout, select this mode, then change the canvas dimensions. Expanding
1152×2048 to 1536×2048 translates every foreground box 192 pixels to the right while retaining
its size and vertical position. The reference image receives the same translation, leaving
192-pixel margins on both sides in the editor and backend preview.

Only full-canvas object boxes continue to fill the canvas: both dimensions must cover at least
98%, with their center within 1% of the canvas center. Other objects remain foregrounds.
Smaller canvases use one uniform scale for the entire layout and reference so edge elements
remain visible. Foreground locks do not change this shared transformation.

Reference placement is saved in workflows. Replace imports establish a fresh alignment base.
Switching modes does not undo earlier resizing, and expanding after shrinking does not restore
the original size; reimport the original draft when needed. Padding is a reference preview,
not automatic outpainting. Existing overlaps in the source layout remain unchanged.

## Medium and canvas structure

`summary.meta` is an array of medium/genre tags (`poster`, `infographic`,
`product campaign`, `editorial`, `comic`, `illustration`, `photography`, `ui_design`).
Use `custom_meta_tags` for extra tags.

`summary.canvas` selects the composition mode:

- `single` — one complete image, the poster default.
- `multi_panel` — panels or module cards for infographics, comparisons and comic grids.
- `collage` — a collage layout.

## Canvas controls

- Drag to move, drag a corner to resize, `Delete` to remove, arrow keys to nudge
  (`Shift` for larger steps).
- Toolbar: grid snap, centre horizontally/vertically, match width/height, distribute
  horizontally/vertically, hide/show all. Match width/height uses the **selected** box as the reference;
  a `🔒` box scales its other edge by its own aspect.
- Layer list: drag `☰` to restack, `👁` to hide (excluded from the output), `🔒` to lock
  the aspect, change the type with the dropdown, edit text and captions inline.
- In `Auto` mode the canvas draw order, the hit-test order and the compiled order are the
  same: text is always on top and larger backgrounds sink first. `T1/C1/O1` labels follow
  the list order, so they stay stable while z-order changes.
- Changing the canvas keeps locked, text and character boxes in proportion; backgrounds
  over 70% area fill the canvas in `Smart` mode.

## Zoom, visibility and palettes (V2.1)

### Canvas zoom and pan

- Wheel over the node canvas zooms between `100%` and `600%` **anchored on the cursor**.
  The wheel is fully claimed by the node (`preventDefault` + `stopImmediatePropagation`),
  so the ComfyUI graph never zooms with it.
- Hold the **middle mouse button** to pan; on a trackpad use **Space + left drag**.
  Chrome's middle-click autoscroll is suppressed too.
- Hit-testing, dragging, corner resizing and double-click creation all divide by
  `1 / zoom`, so they behave exactly like 100%; line widths, handles and labels are
  compensated by `1 / zoom` and stay crisp up to 600%.
- A `🔍 240% ↺` badge appears in the top-right corner: click it, press `0` or
  middle-double-click to return to the centred 100% view.

### Hide / show every box

`👁 Hide All` hides every box (the compiled prompt falls back to the plain `global_prompt`
text) and turns into a highlighted `🚫 Show All`; clicking again restores them. The button
is disabled on an empty canvas.

### Colour palettes

- **Global palette** (the row under the toolbar, written to `summary.palette`): five preset
  themes (Tech Neon, Black & Gold, Warm Editorial, Oriental Crimson, Fresh Infographic),
  a `🎨+` picker for extra colours and `×` to remove a swatch.
- **Per-box palette** (the `🎨` button on each layer row, written to `item.palette`, up to
  four colours): a 16-colour poster grid, a native `<input type="color">` picker, and typed
  values such as `#FF5733` or `ivory`. Chosen colours show as dots on the row and next to
  the box label on the canvas.
- `preview_image` mirrors both: global swatches at the right of the bottom status bar and
  per-box dots next to each label chip.

## Eyedropper and reference palette extraction (V2.2)

### Three ways to pick a colour

| Entry | Behaviour |
|---|---|
| `💧 Pick` in the global palette bar | Uses the native `window.EyeDropper` when available: sample anywhere on screen (other windows included) into `summary.palette` |
| `💧 Eyedropper` in the per-box palette popover | Same, but writes into that box's `item.palette` (max 4) |
| In-canvas loupe (fallback) | Used automatically when `EyeDropper` is unavailable (Firefox / Safari / plain-HTTP LAN), or on demand with the `I` shortcut while the canvas has focus |

In-canvas loupe details:

- The target is resolved automatically: a selected box receives the colour, otherwise the
  global palette does.
- Moving the cursor samples the reference image from a dedicated offscreen buffer (no box
  tint), and draws a crosshair, a circular preview ring and a `#RRGGBB` capsule that flips
  to the left near the right edge.
- Reference sampling inverts the internal zoom and pan. Without a reference, the rendered
  canvas is sampled after redrawing without the loupe ring, crosshair or capsule.
- Left-click confirms and exits; `Esc` or right-click cancels. Cancelling the native
  eyedropper with `Esc` writes nothing and raises no error.

### Extract a palette from the reference image

After a run with `ref_image` connected, both the reference bar and the global palette bar
show `🎨 Extract Palette`:

- the image is downscaled to `48×48`, histogrammed at 4 bits per channel (4096 buckets)
  and each bucket is averaged back to true RGB;
- buckets are taken by population with a minimum RGB distance of 42 so the four swatches
  read as separate colours;
- pixels with alpha < 128, all RGB channels >= 250 (clipped white), or all channels <= 5
  (near-black noise) are excluded; ordinary light, dark and saturated colours remain;
- flat or low-contrast images use remaining valid buckets, up to four colours, without
  inventing colours; if every pixel is excluded, the existing palette is preserved;
- the result replaces the global palette and flashes “4 dominant colours extracted”.

## Composition guides and the text inspector (V2.3)

### Thirds and golden-ratio guides

`📐 Thirds` and `🔱 Golden` are independent toggles. New nodes enable Thirds and disable Golden; saved disabled settings are preserved:

- Thirds draws lines at `1/3` and `2/3`.
- Golden draws lines at `0.382` / `0.618` plus four crosshair power points.
- Guides are painted **after every box**, so a full-canvas background or a reference
  image can never cover them; each line carries a translucent dark halo and stays
  readable on white references.
- With snapping on, dragging a box within 6px of a guide (centre or either edge) snaps
  onto it; disabling the guides disables that snap.
- The toggles live in `node.properties.vmmoss_guides`, so they survive save/reload and
  never appear in `layout_data`, `layout_prompt` or `draft_json`.

### Expandable text inspector

The native global caption field starts at 84px high. Drag its bottom-right corner vertically
to resize it (64px minimum); the node grows with it and saves the height with the workflow.
It remains the original `global_prompt` STRING widget and adds no prompt fields.

Every layer row gains a `⤢` button (double-clicking the row works too):

- It opens a **full-width** drawer under the list with large multi-line fields for
  `Exact text` and `Style / Caption` (12 rows each by default, 12px, Enter for new lines, vertical resize);
  character/object boxes only show the description.
- Text and caption heights are saved separately per node and reused across regions,
  closing/reopening the drawer, and workflow reloads. These preferences do not change layout prompts.
- Edits stay in sync with the compact row, the canvas preview and `layout_data`.
- The drawer follows the selected box, always occupies a single panel height, and can be
  collapsed with `Collapse` or `⤢` again.

### Driving copy from other nodes

Connect any multi-line text node to the two new inputs:

```text
T1: AI Developer Conference 2026 | bold white sans-serif, centred
T2: Oct 25 · Shanghai | light-cyan tech subtitle
C1: cyberpunk female android bust, blue-violet rim light
O1: deep-blue geometric grid backdrop
```

- **Labelled mode**: `T1/C1/O1/T2…` match the on-canvas tags (or use `box_3:`); text
  boxes split `title | style`, character/object boxes take the whole line as description.
  A literal `\n` becomes a real line break.
- **Positional mode**: bare lines fill the 1st, 2nd, 3rd… Text box in order.
- Connected box copy overrides the corresponding local edits on every execution. No layout
  backfill is sent when the current values already match the link. Disconnect `box_texts_in`
  to keep later manual edits, or edit the upstream copy. Connecting only `global_prompt_in`
  does not override individual box text.
- An open inspector remains editable after execution backfill; further text and style edits
  are saved into the current `layout_data`.
- A non-empty `global_prompt_in` overrides the caption and is mirrored back via
  `ui["synced_caption"]`.

## Import and export Skill JSON

Two routes:

1. **Toolbar** `📥 Import JSON`: paste and the canvas, layer list, caption, medium and
   canvas structure are filled immediately; choose *Replace canvas* or *Merge into canvas*.
2. **`external_layout_json` link**: feed JSON from an LLM/Skill node; after a run the
   parsed layout is pushed back through `onExecuted` (`Replace` or `Merge`). Change the
   upstream and run again to refresh.

Three formats are auto-detected:

- Draft (`bbox_coord_space: "abs"` + `bbox_format: "xyxy"`, top-left pixels)
- Compiled (`abs_centralized` + `yxyx`, centre-origin pixels)
- Plain caption (`{"caption": "..."}` or a bare string)

Details:

- ` ```json ` fences are stripped.
- Cross-size imports compute the physical aspect from the **source** canvas first, then
  apply `bbox_ratio_sync` for the target canvas, so nothing is stretched.
- Imported boxes use content-hash ids: re-running or re-importing never duplicates them.
- `📤 Export Draft` produces the same draft shape as the official `compile_prompt.py`, ready
  to paste into the Skill or any LLM; import the answer back to keep iterating.

## Language

The `[中文 | EN]` switch and `ui_language` stay in sync. Toolbar buttons, layer types,
placeholders, the status bar, the import/export dialogs and the node title switch instantly
without a reload. Combo **values** stay bilingual/fixed so switching languages never breaks
a saved workflow; `locales/zh` and `locales/en` also carry the node display names for
ComfyUI's own language setting.

## Migrating from V1

The old `MOSSLayoutStudio` passed layouts through a `MOSS_BBOX` socket. V2 removes that
socket in favour of `external_layout_json`:

- Existing `layout_data` keeps working (the state schema is backward compatible).
- To pass a template between nodes, turn the upstream result into draft JSON text and link
  it, or export the draft to a file and import it later.

## Limitations

- The preview long edge is capped at 1152px; text in it is indicative, not final type.
- A text box without literal text exports an empty `text`. The official `compile_prompt.py`
  requires non-empty `text` for text items, so fill it in (the status bar counts them).
- Bboxes use the official outward rounding: `floor` for top/left and `ceil` for bottom/right,
  so the same normalised box can differ by 1px between canvases.
- `--lowvram` users pay a small extra cost for the preview (fixed long edge, independent of
  the canvas size).

## Troubleshooting

**The canvas looks unchanged but the output size changed.** Check that `canvas_preset`
matches `width/height`; with a linked size the frontend switches the preset to `Custom`
after a run and shows the resolved resolution.

**Importing JSON does nothing.** Make sure the JSON has an `items` array or only a
`caption`, and that every `bbox` has four numbers.

**Text is hidden behind a background.** Use `Auto` ordering, or drag the text row to the
top of the list.
