// Run after building: node scripts/benchmark-deploy.mjs [runs]
// No account, real credentials, or network access are needed.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  benchmarkRuntime,
  readBenchmarkRuntime,
} from './benchmark-runtime.mjs';

const runs = Number(process.argv[2] || 30);
assert(Number.isInteger(runs) && runs > 0);
const entry = fileURLToPath(new URL('../dist/vc.js', import.meta.url));
const guard = fileURLToPath(
  new URL('./benchmark-deploy-api.cjs', import.meta.url)
);
const directory = mkdtempSync(join(tmpdir(), 'vercel-deploy-benchmark-'));
const project = join(directory, 'project');
const config = join(directory, 'config');
for (const path of [
  project,
  config,
  join(project, '.vercel'),
  join(project, 'src'),
  join(project, 'ignored'),
])
  mkdirSync(path, { recursive: true });
writeFileSync(
  join(config, 'config.json'),
  JSON.stringify({ telemetry: { enabled: false }, credStorage: 'file' })
);
// Synthetic values only; the preload supplies project/team metadata in memory.
// No real credentials are read, and no request can reach a network socket.
writeFileSync(
  join(config, 'auth.json'),
  JSON.stringify({ userId: 'benchmark-user', token: 'not-a-real-token' })
);
writeFileSync(
  join(project, '.vercel', 'project.json'),
  JSON.stringify({ orgId: 'team_benchmark', projectId: 'benchmark-project' })
);
writeFileSync(
  join(project, 'vercel.json'),
  JSON.stringify({ version: 2, framework: null })
);
writeFileSync(
  join(project, 'package.json'),
  JSON.stringify({ name: 'benchmark-project', private: true })
);
writeFileSync(join(project, '.vercelignore'), 'ignored/\n');
for (let i = 0; i < 100; i++) {
  writeFileSync(
    join(project, 'src', `file-${i}.txt`),
    `${i}\n${'benchmark data\n'.repeat(200)}`
  );
  writeFileSync(
    join(project, 'ignored', `file-${i}.txt`),
    'must not be included'
  );
}
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (
    /^(VERCEL_|NOW_|GIT_|CI$|CONTINUOUS_INTEGRATION$|BUILD_NUMBER$|RUN_ID$|NODE_OPTIONS$|FF_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|http_proxy$|https_proxy$|all_proxy$)/.test(
      key
    )
  )
    delete env[key];
}
Object.assign(env, {
  VERCEL_TELEMETRY_DISABLED: '1',
  VERCEL_TOKEN_STORAGE: 'file',
  NO_UPDATE_NOTIFIER: '1',
  FORCE_COLOR: '0',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
});
const git = process.env.BENCHMARK_DEPLOY_NO_GIT !== '1';
let expectedGitMetadata;
if (git) {
  const gitEnv = {
    ...env,
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  };
  const runGit = (...args) =>
    execFileSync('git', args, {
      cwd: project,
      env: gitEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  runGit('init', '-b', 'benchmark');
  runGit('add', '--all');
  runGit(
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=Benchmark',
    '-c',
    'user.email=benchmark@example.invalid',
    'commit',
    '-m',
    'Benchmark project'
  );
  expectedGitMetadata = {
    commitAuthorName: 'Benchmark',
    commitAuthorEmail: 'benchmark@example.invalid',
    commitMessage: 'Benchmark project',
    commitRef: 'benchmark',
    commitSha: runGit('rev-parse', 'HEAD'),
    dirty: false,
    rootDirectory: '',
  };
}
const prepare = process.env.BENCHMARK_DEPLOY_DRY_RUN !== '1';
const runtime = benchmarkRuntime(entry, guard, env);
assert(
  !runtime.binary || !process.env.BENCHMARK_PROFILE_DIR,
  'CPU profiling is currently supported only for the JavaScript benchmark'
);
let measuredRuntime;
const results = {};
try {
  for (const archive of [false, true]) {
    const samples = [];
    let signature;
    for (let i = 0; i < runs + 3; i++) {
      const start = performance.now();
      const result = spawnSync(
        runtime.executable,
        [
          ...(process.env.BENCHMARK_PROFILE_DIR && i === 0
            ? [
                '--cpu-prof',
                `--cpu-prof-dir=${process.env.BENCHMARK_PROFILE_DIR}`,
              ]
            : []),
          ...runtime.args,
          'deploy',
          ...(prepare ? [] : ['--dry']),
          '--json',
          ...(process.env.BENCHMARK_DEBUG === '1' ? ['--debug'] : []),
          '--global-config',
          config,
          ...(archive ? ['--archive=tgz'] : []),
        ],
        { cwd: project, env: runtime.env, encoding: 'utf8', timeout: 15000 }
      );
      const elapsed = performance.now() - start;
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      measuredRuntime = readBenchmarkRuntime(result.stderr, runtime.binary);
      assert.match(result.stderr, /BENCHMARK_NETWORK_ATTEMPTS=0/);
      assert.match(result.stderr, /BENCHMARK_METADATA_READS=2/);
      const output = JSON.parse(result.stdout);
      if (prepare) {
        assert.equal(output.boundary, 'before-deployment-request');
        assert.deepEqual(
          output.body.gitMetadata,
          expectedGitMetadata,
          result.stderr
        );
        assert.equal(output.body.files.length, archive ? 1 : 104);
        assert(
          !output.body.files.some(file => file.file.startsWith('ignored/'))
        );
        const normalized = JSON.stringify(
          [...output.body.files].sort((a, b) => a.file.localeCompare(b.file)),
          (key, value) =>
            archive && ['size', 'sha', 'data'].includes(key) ? undefined : value
        );
        const digest = createHash('sha256').update(normalized).digest('hex');
        signature ??= digest;
        assert.equal(digest, signature);
        if (i >= 3) samples.push(elapsed);
        continue;
      }
      assert.equal(output.fileCount, archive ? 1 : 104);
      assert.equal(output.ignoredCount, git ? 102 : 101);
      assert(output.totalSize > 0);
      assert(!output.files.some(file => file.path.startsWith('ignored/')));
      // Tar entry order may vary, changing compressed bytes and their digest.
      // Keep structural assertions for archives; compare all hashes for files.
      const normalized = JSON.stringify(
        { ...output, basePath: '<project>' },
        (key, value) =>
          archive && ['size', 'sha', 'totalSize'].includes(key)
            ? undefined
            : value
      );
      signature ??= createHash('sha256').update(normalized).digest('hex');
      assert.equal(
        createHash('sha256').update(normalized).digest('hex'),
        signature
      );
      if (i >= 3) samples.push(elapsed);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    results[archive ? 'archive' : 'files'] = {
      medianMs:
        sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      signature,
      samples,
    };
  }
  console.log(
    JSON.stringify(
      {
        ...measuredRuntime,
        binary: runtime.binary,
        runs,
        prepare,
        git,
        compileCacheDisabled: env.NODE_DISABLE_COMPILE_CACHE === '1',
        results,
      },
      null,
      2
    )
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
