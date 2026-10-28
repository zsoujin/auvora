import { readFileSync } from 'node:fs';
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const version = json('package.json').version;
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const lock = json('package-lock.json');
for (const candidate of [cargo, json('src-tauri/tauri.conf.json').version, lock.version, lock.packages[''].version]) {
  if (candidate !== version) throw new Error(`Version mismatch: ${candidate} vs ${version}`);
}
const tag = process.argv[2];
if (tag && tag !== `v${version}`) throw new Error(`Tag must be v${version}`);
console.log(`Version verified: ${version}`);
