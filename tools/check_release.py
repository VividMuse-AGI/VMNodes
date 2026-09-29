"""Check local packaging, or enforce public-release metadata. Python 3.11+."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tomllib
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def metadata(root=ROOT):
    return tomllib.loads((root / 'pyproject.toml').read_text(encoding='utf-8'))


def release_date_error(changelog, version):
    """Validate only the exact release heading; unrelated Unreleased sections are valid."""
    headings = re.findall(r'^##\s+(.+?)\s*$', changelog, re.M)
    matches = [h for h in headings if re.match(r'^\[?' + re.escape(version) + r'(?:\]|\s|$)', h)]
    if len(matches) != 1:
        return 'CHANGELOG must contain exactly one heading for the release version'
    heading = matches[0]
    if 'unreleased' in heading.lower() or '尚未公开发布' in heading:
        return 'Finalize the release date in CHANGELOG before publishing'
    stamp = re.search(r'(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)', heading)
    try:
        if stamp is None or date.fromisoformat(stamp[1]) > date.today():
            return 'Set a valid, non-future release date in the release heading'
    except ValueError:
        return 'Set a valid, non-future release date in the release heading'
    return None


def check(root=ROOT, public=False, registry=False):
    errors = []
    data = metadata(root)
    project = data['project']
    version = project['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        errors.append('Invalid semantic version')
    def requirements(name):
        return [s.strip() for s in (root / name).read_text().splitlines()
                if s.strip() and not s.lstrip().startswith('#')]
    if project['dependencies'] != requirements('requirements.txt'):
        errors.append('Base dependencies disagree')
    if project['optional-dependencies']['person-check'] != requirements('requirements-person-check.txt'):
        errors.append('Optional dependencies disagree')
    files = json.loads((root / 'release_files.json').read_text(encoding='utf-8'))
    if len(files) != len(set(files)):
        errors.append('Duplicate package paths')
    for name in files:
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name:
            errors.append(f'Unsafe package path: {name}')
            continue
        source = root / name
        if not source.is_file() or source.is_symlink():
            errors.append(f'Missing or symlinked package file: {name}')
            continue
        if source.suffix in {'.pt', '.pth', '.safetensors', '.ckpt', '.png', '.jpg', '.zip'}:
            errors.append(f'Unreviewed binary in release: {name}')
        if source.suffix in {'.py', '.js', '.json', '.md', '.toml', '.txt'}:
            text = source.read_text(encoding='utf-8')
            if re.search(r'[CDE]:[\\/](?:Users|Codex|ComfyUI)', text, re.I):
                errors.append(f'Local machine path: {name}')
            if re.search(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN .*PRIVATE KEY-----)', text):
                errors.append(f'Potential credential: {name}')
        if source.suffix == '.md':
            for link in re.findall(r'\]\(([^)]+)\)', source.read_text(encoding='utf-8')):
                if re.match(r'https?://|mailto:|#', link):
                    continue
                linked = (source.parent / unquote(link.split('#')[0])).resolve()
                if not linked.is_relative_to(root.resolve()) or not linked.is_file():
                    errors.append(f'Broken local link in {name}: {link}')
                elif linked.relative_to(root.resolve()).as_posix() not in files:
                    errors.append(f'Link excluded from package in {name}: {link}')
    runtime = {p.relative_to(root).as_posix() for folder in ('web', 'locales', 'vm_legacy')
               for p in (root / folder).rglob('*')
               if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}
    runtime |= {p.name for p in root.glob('*.py')}
    for missing in sorted(runtime - set(files)):
        errors.append(f'Runtime file not in release allowlist: {missing}')
    if 'MIT License' not in (root / 'LICENSE').read_text():
        errors.append('MIT license missing')
    if public:
        repo = project.get('urls', {}).get('Repository', '')
        if not re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo):
            errors.append('Set the real GitHub Repository URL before publishing')
        date_error = release_date_error((root / 'CHANGELOG.md').read_text(encoding='utf-8'), version)
        if date_error:
            errors.append(date_error)
        for readme in ('README.md', 'README.en.md'):
            text = (root / readme).read_text(encoding='utf-8')
            if '首次发布候选' in text or 'initial release candidate' in text:
                errors.append(f'Finalize installation status in {readme}')
        if registry and not data.get('tool', {}).get('comfy', {}).get('PublisherId'):
            errors.append('Set the real Registry PublisherId before publishing')
        try:
            tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
            if not set(files).issubset(tracked):
                errors.append('Release files must all be tracked by Git')
            if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip():
                errors.append('Commit reviewed changes before public release')
        except (OSError, subprocess.CalledProcessError):
            errors.append('Public releases require a Git checkout')
    return {'version': version, 'files': len(files), 'public': public,
            'registry': registry, 'errors': errors, 'passed': not errors}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--public', action='store_true')
    parser.add_argument('--registry', action='store_true')
    args = parser.parse_args()
    result = check(public=args.public or args.registry, registry=args.registry)
    print(json.dumps(result, ensure_ascii=True, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
