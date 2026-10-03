"""One-time, owner-authorized renumbering of the first public release."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = 'VividMuse-AGI/VMNodes'
RELEASE_ID = 402267696
OLD_TAG = 'v0.1.7'
NEW_TAG = 'v0.1.0'
OLD_TAG_OBJECT = '23fdd939a04d47750a5e38e7a155447f7a4f1391'
OLD_ASSETS = {
    'VMNodes-0.1.7.zip': (606907157, 'sha256:44df8e45b6ca937a7dfb90afa559a2d7d6da61238c9b297a96352a1afde22240'),
    'VMNodes-0.1.7.zip.sha256': (606907159, 'sha256:66bab90913f3f538517ff74bf02db41fc9f5c2ba06e9b6fd4e1cc232abcc6490'),
}


def api(path, method='GET', payload=None, missing_ok=False):
    command = ['gh', 'api', '--method', method, f'repos/{REPO}/{path}']
    if payload is not None:
        command += ['--input', '-']
    result = subprocess.run(command, input=None if payload is None else json.dumps(payload),
                            text=True, capture_output=True)
    if result.returncode:
        if missing_ok:
            try:
                if str(json.loads(result.stdout).get('status')) == '404':
                    return None
            except ValueError:
                pass
        raise RuntimeError(f'GitHub {method} {path} failed: {result.stderr}')
    return json.loads(result.stdout) if result.stdout.strip() else None


def verify_archive(path):
    expected = json.loads((ROOT / 'release_files.json').read_text(encoding='utf-8'))
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, 'ZIP CRC failure'
        assert set(archive.namelist()) == {'VMNodes/' + name for name in expected} | {'VMNodes/manifest.json'}
        manifest = json.loads(archive.read('VMNodes/manifest.json'))
        assert manifest['version'] == '0.1.0'
        assert {item['path'] for item in manifest['files']} == set(expected)
        for item in manifest['files']:
            content = archive.read('VMNodes/' + item['path'])
            assert content == (ROOT / item['path']).read_bytes(), item['path']
            assert len(content) == item['bytes']
            assert hashlib.sha256(content).hexdigest() == item['sha256']
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize():
    assert os.environ.get('GITHUB_REPOSITORY') == REPO
    assert os.environ.get('GITHUB_REF') == 'refs/heads/main'
    version = tomllib.loads((ROOT / 'pyproject.toml').read_text())['project']['version']
    assert version == '0.1.0'
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    tagged = subprocess.check_output(['git', 'rev-parse', NEW_TAG + '^{commit}'], text=True).strip()
    assert commit == tagged == os.environ['GITHUB_SHA'], 'New tag must pin this reviewed commit'
    zip_path = ROOT / 'dist/VMNodes-0.1.0.zip'
    checksum = zip_path.with_suffix('.zip.sha256')
    digest = verify_archive(zip_path)
    assert checksum.read_text(encoding='utf-8') == digest + '  ' + zip_path.name + '\n'
    notes = (ROOT / 'docs/releases/0.1.0.md').read_text(encoding='utf-8')
    assert notes.startswith('# VMNodes v0.1.0') and '0.1.7' not in notes
    release = api(f'releases/{RELEASE_ID}')
    assert release['tag_name'] in {OLD_TAG, NEW_TAG} and not release['draft'] and release['prerelease']
    assert not release.get('immutable', False), 'Do not alter immutable releases'
    uploads = {path.name: path for path in (zip_path, checksum)}
    allowed = set(uploads) | set(OLD_ASSETS)
    assert all(asset['name'] in allowed for asset in release['assets']), 'Unexpected asset; stop'
    for asset in release['assets']:
        if asset['name'] in OLD_ASSETS:
            assert (asset['id'], asset['digest']) == OLD_ASSETS[asset['name']], 'Old asset identity changed'
    old_ref = api('git/ref/tags/' + OLD_TAG, missing_ok=True)
    if old_ref:
        assert old_ref['object']['sha'] == OLD_TAG_OBJECT, 'Old tag identity changed'
    else:
        assert release['tag_name'] == NEW_TAG, 'Old tag disappeared before renumbering'
    existing = {asset['name']: asset for asset in release['assets']}
    for name, path in uploads.items():
        if name not in existing:
            subprocess.run(['gh', 'release', 'upload', release['tag_name'], str(path)], check=True)
        else:
            assert existing[name]['digest'] == 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='vmnodes-release-download-') as folder:
        subprocess.run(['gh', 'release', 'download', release['tag_name'], '--dir', folder,
                        '--pattern', zip_path.name, '--pattern', checksum.name], check=True)
        downloaded = Path(folder) / zip_path.name
        assert verify_archive(downloaded) == digest
        assert (Path(folder) / checksum.name).read_bytes() == checksum.read_bytes()
    api(f'releases/{RELEASE_ID}', 'PATCH', {
        'tag_name': NEW_TAG, 'name': 'VMNodes v0.1.0', 'body': notes, 'target_commitish': commit,
    })
    updated = api('releases/tags/' + NEW_TAG)
    assert updated['id'] == RELEASE_ID and updated['body'] == notes
    assert not updated['draft'] and updated['prerelease']
    assets = {asset['name']: asset for asset in updated['assets']}
    for name, path in uploads.items():
        assert assets[name]['digest'] == 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
    # Retire only the two pinned old assets after the new downloads were verified.
    for name, (asset_id, old_digest) in OLD_ASSETS.items():
        if name in assets:
            assert (assets[name]['id'], assets[name]['digest']) == (asset_id, old_digest)
            api(f'releases/assets/{asset_id}', 'DELETE')
    if old_ref:
        api('git/refs/tags/' + OLD_TAG, 'DELETE')
    final = api('releases/tags/' + NEW_TAG)
    assert {asset['name'] for asset in final['assets']} == set(uploads)
    assert api('git/ref/tags/' + OLD_TAG, missing_ok=True) is None
    assert api('releases/tags/' + OLD_TAG, missing_ok=True) is None
    print(json.dumps({'release_id': final['id'], 'url': final['html_url'], 'tag': NEW_TAG,
                      'commit': commit, 'sha256': digest, 'old_assets_and_tag_retired': True}, indent=2))


if __name__ == '__main__':
    normalize()
