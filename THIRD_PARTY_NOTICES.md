# Third-party components

VMNodes code uses the MIT license in [LICENSE](LICENSE). Dependencies and model
weights retain their own licenses; VMNodes does not relicense them. No third-party
package source or model weights are bundled.

| Component | Use | License / terms |
| --- | --- | --- |
| ComfyUI | Host and execution APIs | See the installed host's license |
| NumPy, PyTorch, Pillow | Host-provided image/tensor runtime | See each installed distribution |
| OpenCV Python | Resampling and mask operations | See the opencv-python distribution |
| rgthree-comfy | Comparison and group controls in the default single-image example; installed separately | [Upstream project and license](https://github.com/rgthree/rgthree-comfy) |
| Ultralytics (optional) | Independent person verification | See the Ultralytics distribution and upstream licensing terms |
| Qwen Image 2.1 weights | Downloaded separately | [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE): research/evaluation use; commercial use requires a separate license |
| Pruna Qwen Image 2.1 8-step LoRA | Downloaded separately for the default example | [Publisher's model card and terms](https://huggingface.co/PrunaAI/Pruna-Qwen-Image-2.1) |
| SAM / person detection weights | Downloaded separately | Follow each model publisher's terms |

Optional dependencies are not covered by VMNodes' MIT grant. Review their terms
for your intended use. Model sources are in [models.json](docs/models.json);
the tested Qwen and original 8-step LoRA files were hash-checked locally on
2026-10-02. Optional SAM/person-model hashes retain their earlier evidence.

The Qwen Image 2.1 license was checked again on 2026-10-03 (license release date:
2026-09-20, sections 1(i) and 2). VMNodes' MIT license does not grant model-use
rights. This statement concerns that specific model, not every Qwen release.

Legacy-named modules are retained VMNodes compatibility code. No historical user
photographs or result galleries are bundled. Workflows reference user-uploaded
images without embedding them.
