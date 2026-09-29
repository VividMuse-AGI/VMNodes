"""Explicit installation entry, never called by node import. Reuse host packages."""
import argparse
import importlib
import importlib.metadata
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
OPENCV_DISTRIBUTIONS = ('opencv-python', 'opencv-python-headless',
                        'opencv-contrib-python', 'opencv-contrib-python-headless')


def ensure_dependency(module_name, requirements, minimum, check_only=False):
    """No dependency resolver may replace the host's NumPy, torch or OpenCV."""
    try:
        module = importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        if exc.name != module_name:
            raise RuntimeError(
                f'{module_name} has a missing dependency ({exc.name}). '
                'Repair that dependency in ComfyUI Python; VMNodes will not replace host packages.'
            ) from exc
        if module_name == 'cv2':
            # A registered but broken wheel is not the same as an absent package.
            for distribution in OPENCV_DISTRIBUTIONS:
                try:
                    importlib.metadata.version(distribution)
                except importlib.metadata.PackageNotFoundError:
                    continue
                raise RuntimeError(f'{distribution} is installed but cv2 is broken; repair it instead of adding another wheel.')
        if check_only:
            raise RuntimeError(f'Missing {module_name}. Run this installer without --check in ComfyUI Python.') from exc
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--no-deps',
                        '-r', str(ROOT / requirements)], check=True)
        importlib.invalidate_caches()
        try:
            module = importlib.import_module(module_name)
        except ImportError as error:
            raise RuntimeError(
                f'{module_name} was installed without changing host dependencies, but cannot import: {error}. '
                'Resolve the reported dependency in your ComfyUI environment and retry.'
            ) from error
    version = getattr(module, '__version__', '')
    numbers = re.match(r'(\d+)\.(\d+)', version)
    if not numbers or tuple(map(int, numbers.groups())) < minimum:
        raise RuntimeError(f'{module_name} {version} is too old; update its existing distribution, not a second variant.')
    return f'{module_name} {version}: reused / 已复用'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Never run pip; imported libraries may initialize their own configuration')
    parser.add_argument('--person-check', action='store_true', help='Also prepare optional whole-person verification')
    args = parser.parse_args()
    for module_name in ('numpy', 'torch', 'PIL'):
        importlib.import_module(module_name)  # These belong to the ComfyUI host.
    print(ensure_dependency('cv2', 'requirements-opencv.txt', (4, 8), args.check))
    if args.person_check:
        print(ensure_dependency('ultralytics', 'requirements-person-check.txt', (8, 3), args.check))
    print('VMNodes dependencies ready. / VMNodes 依赖已就绪。')


if __name__ == '__main__':
    try:
        main()
    except (ImportError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f'VMNodes installation: {error}', file=sys.stderr)
        raise SystemExit(1)
