# Examples and result limits

[Back to README](../../README.en.md) · [Node guide](nodes/image-edit.md) · [中文](../zh/editing-examples.md)

For everyday local edits, start with Coarse region, draw around the complete old target, describe the change, and run. Precise tracing is not required. If fragments remain, use Preview range only to check for missing coverage instead of repeatedly expanding the selection or switching controls.

## Example: shorten a skirt

> Change the gray long skirt into a gray above-knee A-line skirt. Preserve the person, standing pose, top, shoes, and background. Match the newly revealed legs to the existing lighting.

Include the old hem and the areas where legs and background need to appear. A tested result of this kind was considered usable by a human reviewer, but success is not guaranteed on every image. Check both legs and knees, the hem, skin transitions, and floor shadows.

## Example: narrow a loose top

> Replace the loose navy top with a fitted version. Preserve the person's body shape, seated pose, hands, and trousers. Naturally complete the sofa previously hidden by the clothing.

Include the old garment outline, not just the desired new shape. In a tested case, the top became narrower but a small piece of old fabric remained beside the hand. Switching to Strict drawn mask did not fully resolve it; that result is not a completed repair.

A fragment outside the permitted region stays unchanged. When clothing touches hands, hair, or regular textures, expanding the region can also change those details. The node does not guarantee an automatic boundary that removes all old content while preserving every neighboring detail.

## What to inspect

| Edit | Check |
|---|---|
| Clothing changes that reveal skin | Skin color, texture, and limb continuity |
| Hairstyle or hair-color changes | Missed strands near the forehead and shoulders, and changes to neighboring fabric |
| Sofa or object material changes | Rings of old material around occlusions and incomplete shadow replacement |
| Full-image editing | Changes to faces, backgrounds, and details you intended to retain |

These are current result limitations, not instructions to install more models or enable hidden settings. Judge the whole image and native-size details for your purpose. Automatic seamless treatment of complex boundaries is not guaranteed.

## Use only the features you need

- Resizing only: use VM Image Resize & Align independently.
- Ordinary local editing: one main image, one rough selection, and an edit request. References, protection, and seam harmonization are optional.
- Preserve original pixels in a specific area: use a protection mask, then inspect its boundary with the new content.
- Allow surrounding content to change too: use full-image editing. It is not a guaranteed repair for failed local edits.

Editing currently handles one main image with an optional content reference, produces RGB output, and uses Qwen Image 2.1. A content reference is not batch or multi-main-image editing. Other backends and transparent editing are outside the current scope.
