"""Read the package version from its sole source of truth."""
from pathlib import Path
import re

_metadata = (Path(__file__).parent / "pyproject.toml").read_text(encoding="utf-8")
_project = _metadata.split("[project]", 1)[1].split("\n[", 1)[0]
VERSION = re.search(r'^version\s*=\s*"(\d+\.\d+\.\d+)"\s*$', _project, re.M).group(1)
BUILD = f"{VERSION}+20260929.r2"
