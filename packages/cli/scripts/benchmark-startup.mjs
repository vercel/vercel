// Build first, then run: node scripts/benchmark-startup.mjs [runs]
// `help` exercises normal CLI initialization (unlike the --help fast path).
// Set NODE_DISABLE_COMPILE_CACHE=1 to also measure without Node's compile cache.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  benchmarkRuntime,
  readBenchmarkRuntime,
} from './benchmark-runtime.mjs';

const runs = Number(process.argv[2] || 30);
assert(Number.isInteger(runs) && runs > 0, 'runs must be a positive integer');
const entry = fileURLToPath(new URL('../dist/vc.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'vercel-startup-'));
writeFileSync(
  join(dir, 'config.json'),
  JSON.stringify({ telemetry: { enabled: false }, credStorage: 'file' })
);
writeFileSync(
  join(dir, 'auth.json'),
  JSON.stringify({ userId: 'benchmark-user', token: 'not-a-real-token' })
);
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (
    /^(VERCEL_|NOW_|NODE_OPTIONS$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|http_proxy$|https_proxy$|all_proxy$)/.test(
      key
    )
  )
    delete env[key];
}
Object.assign(env, {
  XDG_CONFIG_HOME: dir,
  VERCEL_TELEMETRY_DISABLED: '1',
  VERCEL_TOKEN_STORAGE: 'file',
  NO_UPDATE_NOTIFIER: '1',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
});
const guard = fileURLToPath(
  new URL('./benchmark-no-network.cjs', import.meta.url)
);
const runtime = benchmarkRuntime(entry, guard, env);
let measuredRuntime;
const samples = [];
let transcript;
try {
  for (let i = 0; i < runs + 3; i++) {
    const start = performance.now();
    const result = spawnSync(
      runtime.executable,
      [...runtime.args, 'help', '--global-config', dir],
      {
        cwd: dir,
        env: runtime.env,
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    const elapsed = performance.now() - start;
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    measuredRuntime = readBenchmarkRuntime(result.stderr, runtime.binary);
    assert.match(result.stderr, /BENCHMARK_NETWORK_ATTEMPTS=0/);
    const stderr = result.stderr.replace(
      /^BENCHMARK_(?:NETWORK_ATTEMPTS|RUNTIME)=.*\n/gm,
      ''
    );
    assert.equal(result.stdout, '');
    assert.match(stderr, /vercel.*\[options\] <command \| path>/);
    transcript ??= stderr;
    assert.equal(stderr, transcript);
    if (i >= 3) samples.push(elapsed);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  console.log(
    JSON.stringify(
      {
        ...measuredRuntime,
        binary: runtime.binary,
        runs,
        compileCacheDisabled: process.env.NODE_DISABLE_COMPILE_CACHE === '1',
        medianMs:
          sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
        stderrSha256: createHash('sha256').update(transcript).digest('hex'),
        samples,
      },
      null,
      2
    )
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
