"""Collect exact unmodified MPL crate archives for release review; no network."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tomllib
import zipfile

root = Path(__file__).resolve().parent.parent
os.chdir(root)
metadata = json.loads(subprocess.check_output([
    'cargo', 'metadata', '--manifest-path', 'src-tauri/Cargo.toml',
    '--filter-platform', 'x86_64-pc-windows-msvc', '--locked', '--offline',
    '--format-version', '1',
], text=True))
locked = tomllib.loads(Path('src-tauri/Cargo.lock').read_text(encoding='utf-8'))
checksums = {(p['name'], p['version']): p.get('checksum') for p in locked['package']}
output = root / 'release/artifacts'
output.mkdir(parents=True, exist_ok=True)
items = []
with zipfile.ZipFile(output / 'auvora-mpl-sources.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for package in metadata['packages']:
        if 'MPL-2.0' not in (package.get('license') or ''):
            continue
        manifest = Path(package['manifest_path'])
        host = manifest.parents[1].name
        source = manifest.parents[3] / 'cache' / host / f"{package['name']}-{package['version']}.crate"
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != checksums[(package['name'], package['version'])]:
            raise RuntimeError(f"Checksum mismatch: {source.name}")
        archive.writestr(source.name, data)
        items.append({'name': source.name, 'sha256': digest, 'license': package['license']})
    archive.write('src-tauri/binaries/licenses/supplemental/MPL-2.0.txt', 'LICENSE-MPL-2.0.txt')
    archive.writestr('components.json', json.dumps(items, indent=2) + '\n')
    archive.writestr('README.txt', 'Unmodified MPL-covered crates from Cargo.lock. Each .crate is a gzip-compressed tar archive containing the source and original notices. These files remain under MPL-2.0. See components.json for checksums. This archive does not cover FFmpeg, Deno or yt-dlp.\n')
print(f'Collected {len(items)} verified MPL crate archives.')
