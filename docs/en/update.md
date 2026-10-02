# Updates and rollback

[Back to README](../../README.en.md)

## Migrating an older manual installation

1. Save your workflows in your user directory and stop the relevant ComfyUI instance.
2. Back up `custom_nodes/VMNodes` **outside** `custom_nodes`. Do not leave loadable copies such as `VMNodes_old` there.
3. Place the new folder at `custom_nodes/VMNodes`, with `__init__.py` and `pyproject.toml` directly inside.
4. Run `custom_nodes/VMNodes/install.py` using ComfyUI's Python. Restart and refresh the page.
5. Open your existing workflow. Node IDs and ports are preserved; no renaming or resizing is required.

Old Klein workflows still need migration to the Qwen workflow. Package migration does not convert them automatically. Keep downloaded model files.

## 0.1.7: separate saving

The editor now provides temporary previews and a Final output. The updated example includes standard Save Image. In your older workflow, connect **Final → Save Image** and set your desired filename prefix there. The editor displays a saving reminder. Without a save node, no persistent output is written. Legacy parameters remain readable without shifting language or other controls.

## Git updates

Run `git status` in VMNodes. On a clean update branch, run:

```shell
git pull --ff-only
```

Stop and preserve local edits if this fails. Do not force-reset your work. A checkout pinned to a version tag needs an explicit choice of a newer version, rather than this branch-update command. The initial candidate has no remote repository yet.

## ZIP updates

Back up and replace the code directory instead of overlaying files. Store backups outside `custom_nodes`. Keep your workflows outside the package so template updates do not overwrite them.

## Rollback

Stop the relevant ComfyUI instance, restore a backup or selected previous release, check that version's dependencies, then restart. Do not automatically downgrade PyTorch/CUDA. Manager snapshots are not complete backups of images, models or the Python environment.

Models, inputs, outputs and user data are outside the replacement scope. New person-verification configuration uses `VMNodes/image_edit/yolo_config` under the user directory; existing legacy configuration remains readable without automatic migration or deletion.

Registry / Manager installation instructions will be added after actual listing and verification. Search-based installation is not available yet.
