"""Optional person detection. Never import Ultralytics on package startup."""
import os
import sys
import threading
from pathlib import Path

_lock = threading.RLock()


def person_config_directory(user_directory):
    """Prefer new data, then legacy data; do not move user files."""
    root = Path(user_directory)
    current = root / "VMNodes" / "image_edit" / "yolo_config"
    legacy = root / "coarse_edit_v9" / "yolo_config"
    return current if current.exists() or not legacy.exists() else legacy


def load_yolo(user_directory):
    with _lock:
        previous = os.environ.get("YOLO_CONFIG_DIR")
        managed = previous is None and "ultralytics" not in sys.modules
        try:
            if managed:
                config = person_config_directory(user_directory)
                config.mkdir(parents=True, exist_ok=True)
                os.environ["YOLO_CONFIG_DIR"] = str(config)
            try:
                from ultralytics import YOLO
            except ModuleNotFoundError as exc:
                if exc.name != "ultralytics":
                    raise
                raise RuntimeError(
                    "VMN_OPTIONAL_PERSON_DEP: 人物独立校验需要可选依赖；请用 ComfyUI 的 Python "
                    "运行 VMNodes/install.py --person-check，然后重启。 "
                    "Independent person verification requires the optional dependency: "
                    "run VMNodes/install.py --person-check using ComfyUI's Python, "
                    "then restart. Ordinary editing and resizing do not require it."
                ) from exc
            return YOLO
        finally:
            if managed:
                os.environ.pop("YOLO_CONFIG_DIR", None)
