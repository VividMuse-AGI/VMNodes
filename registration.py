"""Explicit feature boundaries; failures are logged, never silently ignored."""
import importlib
import logging

FEATURES = (
    ("image_resize", (("geometry", "VMImageResizeAlign", "VM Image Resize & Align"),)),
    ("image_edit", (
        ("edit", "VMImageEdit", "VM Image Edit"),
        ("edit", "VMFinalizeEdit", "VM Internal Composite"),
        ("bridge", "VMImageEditBridge", "VM Image Edit"),
        ("bridge", "VMEditPlan", "VM Internal Range Plan"),
        ("bridge", "VMEditFinish", "VM Internal Preview & Composite"),
    )),
)


def load_features(package, features=FEATURES, importer=importlib.import_module):
    classes, names, errors = {}, {}, {}
    ids = [node_id for _, entries in features for _, node_id, _ in entries]
    if len(ids) != len(set(ids)):
        raise ValueError("VMN_DUPLICATE_NODE_ID: duplicate VMNodes registration")
    for feature, entries in features:
        try:
            pending = {node_id: getattr(importer(f".{module}", package), node_id)
                       for module, node_id, _ in entries}
        except Exception as exc:
            errors[feature] = f"{type(exc).__name__}: {exc}"
            logging.getLogger("VMNodes").exception(
                "VMNodes feature '%s' could not load. Check its dependencies and "
                "ComfyUI version; other features remain available.", feature)
            continue
        classes.update(pending)
        names.update({node_id: label for _, node_id, label in entries})
    return classes, names, errors
