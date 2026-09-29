"""Use a real ComfyUI checkout when requested; otherwise minimal CPU test doubles."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import types

ROOT = Path(__file__).resolve().parents[1]
real_host = os.environ.get('VMN_COMFY_ROOT')
if real_host:
    sys.path.insert(0, real_host)
    sys.argv = [sys.argv[0], '--cpu']
else:
    scratch = tempfile.TemporaryDirectory(prefix='vmnodes-tests-')
    folder = types.ModuleType('folder_paths')
    folder.models_dir = str(Path(scratch.name) / 'models')
    folder.get_user_directory = lambda: str(Path(scratch.name) / 'user')
    folder.get_output_directory = lambda: str(Path(scratch.name) / 'output')
    folder.add_model_folder_path = lambda *args: None
    folder.get_full_path = lambda *args: None
    sys.modules['folder_paths'] = folder
    execution = types.ModuleType('comfy_execution')
    graph = types.ModuleType('comfy_execution.graph_utils')
    class ExecutionBlocker:
        def __init__(self, message):
            self.message = message
    class GraphBuilder:
        def __init__(self, *args, **kwargs):
            raise AssertionError('Dynamic execution requires real ComfyUI, not the test double')
    graph.ExecutionBlocker, graph.GraphBuilder = ExecutionBlocker, GraphBuilder
    sys.modules['comfy_execution'] = execution
    sys.modules['comfy_execution.graph_utils'] = graph


def load_package(path=ROOT, name='vmnodes_test'):
    spec = importlib.util.spec_from_file_location(name, Path(path) / '__init__.py',
                                                submodule_search_locations=[str(path)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


package = load_package()
if package.IMPORT_ERRORS:
    raise RuntimeError(package.IMPORT_ERRORS)
