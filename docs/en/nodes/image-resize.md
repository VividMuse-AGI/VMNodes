# VM Image Resize & Align

[Back to README](../../../README.en.md) · [中文](../../zh/nodes/image-resize.md)

No generative model is required. Connect Load Image to use this node independently.

After selecting a resize mode, click **Size info / Resize options** at the bottom of the node to set the target size and interpolation. These controls are inactive in Keep original size mode. The panel also shows the last run dimensions.


The defaults are a good starting point. If the image is too large, generation is slow, or you run out of GPU memory, reduce the processing size.

| Setting | Purpose and suggestion |
|---|---|
| **Keep original size** | Avoids resizing; use it to try the original image size first |
| **Resize by long edge / width / height** | Adjusts the selected dimension while keeping the aspect ratio |
| **Target size** | Sets that dimension in pixels; for example, a long edge of 1024 |
| **Interpolation** | Controls how details are resampled. Keep `bicubic` for general photographic use |
| **Divisible by** | Aligns the processing dimensions for the model. Keep **32** for this workflow |
| **Language** | Auto, Chinese, or English; can be set independently from the edit node |

Interpolation guide: `bicubic` suits general photos; `area` is useful for downscaling; `bilinear` gives smoother results; `lanczos` can look sharper but may introduce edge halos; `nearest-exact` keeps hard edges and suits pixel art.

When connected to VM Image Edit together with its size context, the final edit returns to the original dimensions. Standalone resizing outputs the resized/aligned image. Restoring its dimensions does not recover details lost during downscaling, so avoid reducing the processing size more than necessary.


## Connections

`image` is the source. Optional `edit_mask` and `protect_mask` must match that source's dimensions. Outputs are the processed image, edit mask, protection mask, size context and size information, in that order.

For editing, connect the image, masks and context from the same resize node. Alignment pads the right and bottom edges; it does not center-shift the original image.

For Qwen Image 2.1 editing, both final working dimensions must be divisible by 32; keep Divisible by at 32. Other divisors can serve standalone use or other downstream nodes. The edit node rejects dimensions that do not meet Qwen's requirement. The official encoder's `resolution=0` still rounds and resizes non-aligned images; it does not replace consistent size alignment.

Standalone resizing accepts one RGB or RGBA image and retains the fourth channel. This does not mean downstream VM Image Edit preserves transparent output.
