import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (result.status !== 0) throw new Error(result.stderr);
const files = [...new Set(result.stdout.split('\0').filter(Boolean))];
const problems = [];
const sensitiveName = /(?:^|\/)(?:\.env(?:\..*)?|cookies[^/]*\.txt)$|\.(?:pem|key|pfx|p12|sqlite3?|db|mp3|m4a|wav|flac|ogg|opus|log)$/i;
const secret = /(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const personalPath = /[A-Za-z]:[\\/]Users[\\/](?!Public(?:[\\/]|$)|Default(?:[\\/]|$))[^\s"'<>]+/i;
for (const path of files) {
  if (sensitiveName.test(path) && path !== '.env.example') problems.push(`${path}: sensitive filename`);
  if (/\.(?:png|jpe?g|ico|icns)$/i.test(path)) continue;
  if (!statSync(path).isFile()) continue;
  const content = readFileSync(path, 'utf8');
  if (secret.test(content)) problems.push(`${path}: possible credential (value suppressed)`);
  if (personalPath.test(content)) problems.push(`${path}: personal absolute path`);
}
if (problems.length) throw new Error(problems.join('\n'));
console.log(`Publication hygiene checked: ${files.length} source files. This heuristic does not replace manual or history review.`);

if (process.argv.includes('--history')) {
  const git = (args) => {
    const out = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (out.status !== 0) throw new Error(out.stderr || 'History inspection failed');
    return out.stdout;
  };
  const commits = git(['rev-list', '--all']).trim().split('\n').filter(Boolean);
  const inspected = new Set();
  for (const commit of commits) {
    if (secret.test(git(['show', '-s', '--format=%B', commit]))) problems.push(`${commit.slice(0, 12)}: possible credential in commit message (value suppressed)`);
    for (const entry of git(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean)) {
      const separator = entry.indexOf('\t');
      const [mode, type, sha] = entry.slice(0, separator).split(' ');
      const path = entry.slice(separator + 1);
      if (sensitiveName.test(path) && path !== '.env.example') problems.push(`${commit.slice(0, 12)}:${path}: sensitive filename`);
      if (type !== 'blob' || /\.(?:png|jpe?g|ico|icns)$/i.test(path) || inspected.has(sha)) continue;
      inspected.add(sha);
      const content = git(['cat-file', 'blob', sha]);
      if (secret.test(content)) problems.push(`${commit.slice(0, 12)}:${path}: possible credential (value suppressed)`);
      if (personalPath.test(content)) problems.push(`${commit.slice(0, 12)}:${path}: personal absolute path`);
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`Reachable history heuristic checked: ${commits.length} commits, ${inspected.size} distinct text blobs. Author contact metadata is intentionally retained; owner review is still required before public visibility.`);
}
