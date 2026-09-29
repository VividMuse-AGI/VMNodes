"""Build a deterministic, allowlisted ZIP with one VMNodes root directory."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from check_release import ROOT, check, metadata


def build(destination, root=ROOT):
    result = check(root)
    if not result['passed']:
        raise ValueError(result['errors'])
    version = metadata(root)['project']['version']
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / f'VMNodes-{version}.zip'
    names = json.loads((root / 'release_files.json').read_text(encoding='utf-8'))
    payload = {name: (root / name).read_bytes() for name in sorted(names)}
    manifest = {'version': version, 'files': [
        {'path': name, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
        for name, content in payload.items()]}
    payload['manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, content in payload.items():
            info = zipfile.ZipInfo('VMNodes/' + name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(digest + '  ' + output.name + '\n', encoding='utf-8')
    return {'archive': str(output), 'sha256': digest, 'entries': len(payload)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    print(json.dumps(build(args.output), ensure_ascii=True, indent=2))
