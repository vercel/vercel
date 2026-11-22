import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../scripts/test-native-builders.mjs', import.meta.url)
);
const fixtures = ['node', 'static-build', 'backends', 'python', 'go'];
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'native-builders-test-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function runChecks({
  requireAll = false,
  missing = 'node',
  selectedFixtures = 'node',
  scenarios = '',
  preview = true,
  buildFails = false,
} = {}) {
  const responses: Record<string, number> = {};
  const builders = Object.fromEntries(
    fixtures.map(fixture => {
      const name = `@vercel/${fixture}`;
      const url = preview
        ? `https://preview.invalid/tarballs/vercel-${fixture}.tgz`
        : `https://registry.npmjs.org/@vercel%2f${fixture}/1.0.0`;
      const id = preview
        ? `remote~${url.replace(/:/g, '_c').replace(/\//g, '+')}`
        : `registry~${name}@1.0.0`;
      responses[url] = fixture === missing ? 404 : 200;
      return [
        name,
        {
          lockfile: {
            nodes: {
              [id]: [null, name, null, null, null, { version: '1.0.0' }],
            },
          },
        },
      ];
    })
  );
  const graphPath = join(directory, 'graph.br');
  writeFileSync(
    graphPath,
    new Uint8Array(brotliCompressSync(JSON.stringify({ builders })))
  );

  // Run the real entrypoint (including argument parsing and exit status), but
  // replace its external boundaries. No network requests or native builds run.
  const preload = join(directory, 'preload.mjs');
  writeFileSync(
    preload,
    `import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

const responses = ${JSON.stringify(responses)};
globalThis.fetch = async url => {
  assert.ok(url in responses, 'Unexpected request: ' + url);
  return { status: responses[url], ok: responses[url] === 200 };
};
childProcess.spawn = (command, args, { cwd, env }) => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    if (args[0] === '--internal-eject') {
      const target = join(args[1], 'dist', 'builders');
      mkdirSync(target, { recursive: true });
      copyFileSync(${JSON.stringify(graphPath)}, join(target, 'builder-graph.json.br'));
    } else {
      assert.deepEqual(args, ['build']);
      assert.equal(${JSON.stringify(selectedFixtures)}, 'static-build');
      if (${buildFails}) {
        child.stderr.write('stub build failed');
        child.emit('close', 1, null);
        return;
      }
      const output = join(cwd, '.vercel', 'output');
      mkdirSync(join(output, 'static'), { recursive: true });
      writeFileSync(join(output, 'config.json'), '{"version":3}');
      writeFileSync(join(output, 'static', 'index.txt'), 'ok');
      const hash = 'a'.repeat(64);
      const root = join(env.HOME, 'builders-vlt', hash);
      if (!existsSync(root)) {
        const pkg = join(root, 'node_modules', '@vercel', 'static-build');
        mkdirSync(pkg, { recursive: true });
        writeFileSync(join(root, '.vercel-builder-graph'), hash);
        writeFileSync(join(pkg, 'package.json'), '{"name":"@vercel/static-build"}');
      }
    }
    child.emit('close', 0, null);
  });
  return child;
};
syncBuiltinESMExports();
`
  );
  const summaryPath = join(directory, 'summary.md');
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      pathToFileURL(preload).href,
      script,
      '--binary',
      join(directory, 'stub-binary'),
      '--work',
      join(directory, 'work'),
      '--fixtures',
      selectedFixtures,
      // Exercise the script's defaults unless a test selects specific scenarios.
      ...(scenarios ? ['--scenarios', scenarios] : []),
      ...(requireAll ? ['--require-all'] : []),
    ],
    {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        GITHUB_ACTIONS: 'true',
        GITHUB_STEP_SUMMARY: summaryPath,
      },
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stderr).toBe('');
  return { ...result, summary: readFileSync(summaryPath, 'utf8') };
}

describe('native Builder coverage requirements', () => {
  it.each([
    'refused',
    'stalled',
  ])('rejects the removed %s scenario', scenario => {
    const result = spawnSync(
      process.execPath,
      [script, '--binary', 'unused-binary', '--scenarios', scenario],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, NODE_OPTIONS: '' },
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Unknown value "${scenario}". Expected cold, warm, concurrent, offline.`
    );
  });

  it.each([
    false,
    true,
  ])('handles missing node preview tarballs in default scenarios with require-all=%s', requireAll => {
    const { status, stdout, summary } = runChecks({ requireAll });
    const outcome = requireAll ? 'FAIL' : 'SKIP';
    expect(status).toBe(requireAll ? 1 : 0);
    for (const name of [
      'node fixture',
      'concurrent cold builds',
      'offline build from preinstalled Builders',
    ]) {
      expect(stdout).toContain(`${outcome}  ${name}:`);
      expect(summary).toContain(`| ${name} | ${outcome}:`);
    }
    expect(stdout).toContain('@vercel/node needs @vercel/node@1.0.0');
    expect(stdout).toContain(
      requireAll
        ? '0 passed, 3 failed, 0 skipped.'
        : '0 passed, 0 failed, 3 skipped.'
    );
    expect(stdout).toContain(requireAll ? '::error ' : '::notice ');
    expect(stdout.includes('--require-all forbids skipping')).toBe(requireAll);
  });

  it('continues to skip unpublished npm bumps by default', () => {
    const { status, stdout } = runChecks({ preview: false });
    expect(status).toBe(0);
    expect(stdout).toContain('0 passed, 0 failed, 3 skipped.');
    expect(stdout).not.toContain('::error ');
  });

  it.each([
    'static-build',
    'backends',
    'python',
    'go',
  ])('requires the selected %s fixture, not only node', fixture => {
    const { status, stdout } = runChecks({
      requireAll: true,
      missing: fixture,
      selectedFixtures: fixture,
      scenarios: 'cold,warm',
    });
    expect(status).toBe(1);
    expect(stdout).toContain(`FAIL  ${fixture} fixture:`);
    expect(stdout).toContain('0 passed, 1 failed, 0 skipped.');
  });

  it.each([
    false,
    true,
  ])('handles offline preinstall missing an unselected Builder with require-all=%s', requireAll => {
    const { status, stdout } = runChecks({
      requireAll,
      missing: 'static-build',
      scenarios: 'offline',
    });
    expect(status).toBe(requireAll ? 1 : 0);
    expect(stdout).toContain(
      `${requireAll ? 'FAIL' : 'SKIP'}  offline build from preinstalled Builders:`
    );
    expect(stdout).not.toContain('node fixture:');
  });

  it('passes strict selected checks despite unrelated missing Builders', () => {
    const { status, stdout } = runChecks({
      requireAll: true,
      selectedFixtures: 'static-build',
      scenarios: 'cold,warm',
    });
    expect(status).toBe(0);
    expect(stdout).toContain('PASS  cold build: static-build');
    expect(stdout).toContain('PASS  warm build: static-build');
    expect(stdout).toContain('2 passed, 0 failed, 0 skipped.');
  });

  it.each([
    false,
    true,
  ])('preserves build failures with require-all=%s', requireAll => {
    const { status, stdout } = runChecks({
      requireAll,
      selectedFixtures: 'static-build',
      scenarios: 'cold',
      buildFails: true,
    });
    expect(status).toBe(1);
    expect(stdout).toContain('stub build failed');
    expect(stdout).toContain('0 passed, 1 failed, 0 skipped.');
  });

  it('enables strict coverage only for PR preview checks', () => {
    const readWorkflow = (name: string) =>
      readFileSync(
        new URL(
          `../../../../../.github/workflows/${name}.yml`,
          import.meta.url
        ),
        'utf8'
      );
    const workflow = load(readWorkflow('pr-binaries')) as {
      jobs: {
        build: {
          steps: {
            name: string;
            run?: string;
            'continue-on-error'?: boolean;
          }[];
        };
      };
    };
    const step = workflow.jobs.build.steps.find(
      step => step.name === 'Native Builder checks'
    )!;
    expect(step.run).toContain('test-native-builders.mjs');
    expect(step.run).toContain('--require-all');
    expect(step['continue-on-error']).not.toBe(true);
    expect(readWorkflow('native-binaries')).not.toContain('--require-all');
  });
});
