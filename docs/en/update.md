# Updates and rollback

[Back to README](../../README.en.md)

VMNodes **0.1.7** is the first public Pre-release. For a new installation, follow the [README instructions](../../README.en.md#installation). Update the whole package; individual nodes do not need separate updates. Before updating, save your workflows in your user directory and stop the relevant ComfyUI instance.

## Git updates

Run `git status` in `ComfyUI/custom_nodes/VMNodes`. Check that there are no local changes and that you are on the branch used for updates, then run:

```shell
git pull --ff-only
```

If you have local edits or diverging branches, preserve your work and resolve the conflict first. Do not force-reset it. For an installation pinned to a version tag, choose a target version from [this repository's Releases](https://github.com/VividMuse-AGI/VMNodes/releases), then switch to its tag. The command above only updates a branch.

When dependencies change, run this from the ComfyUI directory using **ComfyUI's Python environment**:

```shell
python custom_nodes/VMNodes/install.py
```

For portable or bundled installations, replace `python` with their included Python executable. Restart ComfyUI and refresh the page afterward.

## ZIP updates or replacing an existing installation

1. Download the desired package, such as `VMNodes-0.1.7.zip`, under **Assets** in [this repository's Releases](https://github.com/VividMuse-AGI/VMNodes/releases). The matching `.zip.sha256` file provides the SHA-256 checksum.
2. Back up `custom_nodes/VMNodes` **outside** `custom_nodes`. Do not leave loadable copies such as `VMNodes_old` there.
3. Extract the new package, name its folder `VMNodes`, and place it at `custom_nodes/VMNodes`. Check that `__init__.py` and `pyproject.toml` are directly inside. Replace the directory rather than overlaying old files.
4. Run the dependency installation command above using ComfyUI's Python, restart, refresh the page, and open your workflow.

Keep your own workflows in your user directory so replacing the code does not remove them. To move from a ZIP installation to Git, back up the old directory as above, then use the [README clone command](../../README.en.md#installation).

## 0.1.7: saving in existing workflows

The editor provides temporary previews and a **Final** output. A separate save node writes persistent files. The default `Qwen-Image-2.1-Single-Image-Edit.json` already includes standard Save Image.

In an older workflow, connect **VM Image Edit Final → Save Image** and set the filename prefix on that node. Without a save node, previews do not create persistent output files. Legacy workflow parameters remain readable.

## Rollback

Stop the relevant ComfyUI instance, restore `VMNodes` from a backup or a selected earlier release, check that version's dependencies, then restart and refresh the page. If no earlier public release is available, use your own backup. Do not automatically downgrade PyTorch/CUDA.

Models, inputs, outputs and user data are outside the code replacement scope and do not need deletion. Registry / Manager installation and version-selection instructions will follow after listing and verification.
