import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const missing = [];
const manifest = JSON.parse(readFileSync(new URL('../src-tauri/binaries/versions.json', import.meta.url), 'utf8'));
if (process.platform !== "win32") missing.push("Windows x64 build host");
if (spawnSync("cargo", ["--version"], { encoding: "utf8" }).status !== 0)
  missing.push("Rust stable (MSVC target)");
for (const name of ["yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe", "deno.exe"]) {
  const path = new URL(`../src-tauri/binaries/${name}`, import.meta.url);
  if (!existsSync(path))
    missing.push(`src-tauri/binaries/${name}`);
  else if (createHash('sha256').update(readFileSync(path)).digest('hex') !== manifest.files[name])
    missing.push(`verified SHA-256 for ${name}`);
}
if (missing.length) {
  console.error(
    `Cannot package an incomplete release. Missing:\n${missing.map((v) => ` - ${v}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  "Release prerequisites found. Tauri will check MSVC and Windows SDK.",
);
