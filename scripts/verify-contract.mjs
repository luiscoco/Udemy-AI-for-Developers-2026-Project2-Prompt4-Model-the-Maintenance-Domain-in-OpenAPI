// Verifies that committed contract models match a fresh regeneration from
// packages/contract/openapi.yaml.
//
// 1. Snapshot the generated directories.
// 2. Run the real generators (`npm run contract:generate`).
// 3. Compare byte-for-byte. On drift, report the files, restore the snapshot so
//    the working tree is left untouched, and exit non-zero.
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const generatedDirs = [
  'packages/contract/src/generated',
  'apps/backend/src/equipment_maintenance_hub/models/generated',
];
const ignored = new Set(['__pycache__', '.DS_Store', 'Thumbs.db']);

/** @param {string} dir @returns {Map<string, Buffer>} */
function snapshot(dir) {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  /** @param {string} current */
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(relative(root, full).replaceAll('\\', '/'), readFileSync(full));
    }
  };
  walk(join(root, dir));
  return files;
}

/** @param {Map<string, Buffer>} files */
function restore(files) {
  for (const dir of generatedDirs) {
    for (const path of snapshot(dir).keys()) rmSync(join(root, path));
  }
  for (const [path, content] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

const before = new Map(generatedDirs.flatMap((dir) => [...snapshot(dir)]));

try {
  execSync('npm run contract:generate', { cwd: root, stdio: 'inherit' });
} catch {
  restore(before);
  console.error('\nverify:contract: generation failed; committed files restored.');
  process.exit(1);
}

const after = new Map(generatedDirs.flatMap((dir) => [...snapshot(dir)]));
const drift = [
  ...[...after.keys()].filter((p) => !before.has(p)).map((p) => `added     ${p}`),
  ...[...before.keys()].filter((p) => !after.has(p)).map((p) => `removed   ${p}`),
  ...[...after]
    .filter(([p, content]) => before.has(p) && !content.equals(/** @type {Buffer} */ (before.get(p))))
    .map(([p]) => `modified  ${p}`),
];

if (drift.length > 0) {
  restore(before);
  console.error('\nverify:contract: generated models are out of date with openapi.yaml:');
  for (const line of drift) console.error(`  ${line}`);
  console.error('\nRun `npm run contract:generate`, review the diff, and commit the result.');
  console.error('Do not edit generated files by hand.');
  process.exit(1);
}

console.log('\nverify:contract: generated TypeScript and Python models match openapi.yaml.');
