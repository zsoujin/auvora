import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const notices = ['auvora third-party notices\nGenerated from package-lock.json production packages and Cargo.lock resolved packages.\n'];
const inventory = [];
const supplemental = {
  'alloc-stdlib@0.3.0': ['alloc-stdlib.txt'],
  'selectors@0.38.0': ['MPL-2.0.txt'],
  'tauri-plugin@2.7.2': ['tauri-plugin-MIT.txt', 'tauri-plugin-APACHE.txt'],
  'webview2-com@0.39.1': ['webview2-com.txt'],
  'webview2-com-sys@0.39.1': ['webview2-com.txt'],
  'webview2-com-macros@0.8.1': ['webview2-com-macros.txt'],
};
function collect(base, label, license) {
  const files = readdirSync(base).filter(n => /^(licen[sc]e|notice|copying)/i.test(n) && statSync(join(base, n)).isFile());
  const extras = supplemental[label] || [];
  inventory.push({ component: label, license: license || 'UNSPECIFIED', noticeFiles: [...files, ...extras.map(n => `supplemental/${n}`)] });
  for (const file of files) notices.push(`\n=== ${label} / ${file} ===\n${readFileSync(join(base, file), 'utf8')}`);
  for (const file of extras) notices.push(`\n=== ${label} / supplemental/${file} ===\n${readFileSync(join('src-tauri/binaries/licenses/supplemental', file), 'utf8')}`);
}
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path || pkg.dev) continue;
  collect(path, `${path.replace(/^node_modules\//, '')}@${pkg.version}`, pkg.license);
}
const result = spawnSync('cargo', ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--filter-platform', 'x86_64-pc-windows-msvc', '--locked', '--offline', '--format-version', '1'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (result.status !== 0) throw new Error(result.stderr || 'cargo metadata failed; run cargo fetch --locked first');
const metadata = JSON.parse(result.stdout);
for (const pkg of metadata.packages.filter(p => p.source).sort((a,b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) collect(dirname(pkg.manifest_path), `${pkg.name}@${pkg.version}`, pkg.license);
writeFileSync('src-tauri/binaries/licenses/app-dependencies.txt', notices.join('\n'));
writeFileSync('docs/dependency-licenses.json', JSON.stringify(inventory, null, 2) + '\n');
const missing = inventory.filter(p => !p.noticeFiles.length || p.license === 'UNSPECIFIED');
console.log(`${inventory.length} locked dependencies; ${missing.length} missing local notice/license metadata. Redistribution review is separate.`);
if (missing.length) throw new Error(JSON.stringify(missing, null, 2));
