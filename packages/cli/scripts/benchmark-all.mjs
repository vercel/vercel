// Run every startup/deploy variant sequentially against one runtime.
// BENCHMARK_BINARY=/absolute/path/to/vercel node scripts/benchmark-all.mjs 30 results.json
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runs = Number(process.argv[2] || 30);
assert(Number.isInteger(runs) && runs > 0);
const output = process.argv[3];
const cwd = fileURLToPath(new URL('../', import.meta.url));
const binary = process.env.BENCHMARK_BINARY
  ? resolve(process.env.BENCHMARK_BINARY)
  : undefined;
const results = { runs, binary, cases: {} };
if (binary) {
  const bytes = readFileSync(binary);
  results.binaryBytes = bytes.length;
  results.binarySha256 = createHash('sha256').update(bytes).digest('hex');
}
for (const disabled of [false, true]) {
  const cache = disabled ? 'cacheDisabled' : 'defaultCache';
  const env = { ...process.env };
  delete env.BENCHMARK_PROFILE_DIR;
  delete env.BENCHMARK_DEPLOY_DRY_RUN;
  delete env.BENCHMARK_DEPLOY_NO_GIT;
  if (disabled) env.NODE_DISABLE_COMPILE_CACHE = '1';
  else delete env.NODE_DISABLE_COMPILE_CACHE;

  const cases = [
    { name: `${cache}.help`, script: 'benchmark-startup.mjs', env },
  ];
  for (const git of [false, true]) {
    for (const dry of [false, true]) {
      cases.push({
        name: `${cache}.${git ? 'git' : 'noGit'}.${dry ? 'dry' : 'prepare'}`,
        script: 'benchmark-deploy.mjs',
        env: {
          ...env,
          BENCHMARK_DEPLOY_NO_GIT: git ? '0' : '1',
          BENCHMARK_DEPLOY_DRY_RUN: dry ? '1' : '0',
        },
      });
    }
  }
  for (const test of cases) {
    process.stderr.write(
      `Benchmarking ${test.name} (${runs} runs per mode)...\n`
    );
    const child = spawnSync(
      process.execPath,
      [`scripts/${test.script}`, String(runs)],
      {
        cwd,
        env: test.env,
        encoding: 'utf8',
        timeout: 15 * 60 * 1000,
      }
    );
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    results.cases[test.name] = JSON.parse(child.stdout);
    // Save each completed case so interrupted runs retain their raw samples.
    if (output) writeFileSync(output, `${JSON.stringify(results, null, 2)}\n`);
  }
}
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
