"""VMNodes: a single ComfyUI package with independently registered features."""
from .registration import load_features
from .version import VERSION, BUILD
import logging
from pathlib import Path

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS, IMPORT_ERRORS = load_features(__name__)
# Preserve imports used by existing integrations, in addition to ComfyUI IDs.
globals().update(NODE_CLASS_MAPPINGS)
__version__ = VERSION
logging.getLogger("VMNodes").info(
    "VMNodes loaded: version=%s build=%s path=%s", VERSION, BUILD,
    Path(__file__).resolve().parent)
