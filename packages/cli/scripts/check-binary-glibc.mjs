// Fail if a linux ELF requires a newer glibc than the supported ceiling.
// Used in realease-binary.yml so we never publish a native CLI that cannot run
// on Vercel Sandboxes (Amazon Linux 2023 / glibc 2.34) or other older hosts.
//
// Usage: node scripts/check-binary-glibc.mjs <binary> [maxGlibc]
// Default maxGlibc is 2.28 (manylinux_2_28 / official Node linux builds).

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const binPath = resolve(process.argv[2] ?? '');
const maxGlibc = process.argv[3] ?? '2.28';

if (!binPath) {
  console.error(
    'Usage: node scripts/check-binary-glibc.mjs <binary> [maxGlibc]'
  );
  process.exit(2);
}

const result = spawnSync('strings', [binPath], {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
});

if (result.error) {
  console.error(`Failed to scan ${binPath}: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `strings exited ${result.status} for ${binPath}:\n${result.stderr || ''}`
  );
  process.exit(1);
}

const versions = new Set();
for (const match of result.stdout.matchAll(/GLIBC_(\d+\.\d+)/g)) {
  versions.add(match[1]);
}

if (versions.size === 0) {
  console.error(`No GLIBC_* version symbols found in ${binPath}`);
  process.exit(1);
}

const sorted = [...versions].sort(compareGlibc);
const highest = sorted[sorted.length - 1];

console.log(
  `${binPath}: glibc symbols ${sorted.join(', ')} (highest ${highest})`
);

if (compareGlibc(highest, maxGlibc) > 0) {
  console.error(
    `::error::${binPath} requires GLIBC_${highest}, which exceeds the ` +
      `supported ceiling GLIBC_${maxGlibc}. Rebuild the embedded Node runtime ` +
      `on an older glibc baseline (e.g. manylinux_2_28).`
  );
  process.exit(1);
}

console.log(`OK: highest GLIBC_${highest} <= ceiling GLIBC_${maxGlibc}`);

function compareGlibc(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
