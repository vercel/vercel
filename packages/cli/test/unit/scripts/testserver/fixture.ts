import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';

/**
 * A temp repo with a CLI and two runtime workspace deps, one transitive, for
 * the Testserver runner tests. Returns its root; the caller removes it.
 */
export function makeRunnerRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'testserver-runner-'));

  function file(path: string, content = '') {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  function pkg(dir: string, manifest: object) {
    file(`${dir}/package.json`, JSON.stringify(manifest));
  }

  function link(fromDir: string, name: string, toDir: string) {
    const at = join(root, fromDir, 'node_modules', name);
    mkdirSync(join(at, '..'), { recursive: true });
    symlinkSync(join(root, toDir), at, 'dir');
  }

  file('package.json', JSON.stringify({ packageManager: 'pnpm@10.29.3' }));
  file('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  file(
    'pnpm-workspace.yaml',
    "packages:\n  - 'packages/*'\n  - 'api'\n  - 'missing'\n"
  );
  file('.npmrc', 'save-exact=true\n');
  pkg('api', { name: 'api' });
  pkg('packages/cli', {
    name: 'vercel',
    dependencies: {
      '@vercel/builder': 'workspace:*',
      '@vercel/auth': 'workspace:*',
      chalk: '4.1.0',
    },
    devDependencies: { '@vercel/client': 'workspace:*' },
  });
  pkg('packages/builder', {
    name: '@vercel/builder',
    files: ['dist', 'edge-entry.js', 'bin', '!dist/*.test.js'],
    dependencies: { '@vercel/utils': 'workspace:*' },
  });
  pkg('packages/utils', { name: '@vercel/utils' });
  pkg('packages/auth', { name: '@vercel/auth', files: ['*.js', '*.ts'] });
  pkg('packages/client', { name: '@vercel/client', files: ['dist'] });
  link('packages/cli', '@vercel/builder', 'packages/builder');
  link('packages/cli', '@vercel/auth', 'packages/auth');
  link('packages/cli', '@vercel/client', 'packages/client');
  link('packages/builder', '@vercel/utils', 'packages/utils');

  file('packages/cli/dist/index.js');
  file('packages/cli/dist/version.mjs');
  file('packages/cli/src/index.ts');
  file('packages/cli/scripts/start.js');
  file('packages/cli/vitest.testserver.config.mts');
  file('packages/cli/test/testserver/commands/whoami/whoami.test.ts');
  file('packages/cli/test/testserver/.results/x/y/cli.json');
  file('packages/cli/test/testserver/node_modules/z.js');
  file('packages/cli/test/helpers/get-cli-path.ts');
  file('packages/cli/test/helpers/setup-unit-fixture.ts');
  file('packages/cli/test/unit/other.test.ts');
  file('packages/builder/dist/index.js');
  file('packages/builder/edge-entry.js');
  file('packages/builder/src/index.ts');
  file('packages/utils/dist/index.js');
  file('packages/utils/src/index.ts');
  file('packages/auth/oauth.js');
  file('packages/auth/oauth.ts');
  file('packages/auth/oauth.js.map');
  file('packages/client/dist/index.js');
  return root;
}

/** The fields of an execa (`reject: false`) result that the build reads. */
export type LaunchResult = { failed: boolean; message: string };

/**
 * A fake execa: resolves with `result`, or, with no result, only once
 * `kill()` stops it, the way a terminated build exits. `started` resolves
 * once the build is launched.
 */
export function fakeLauncher(result?: LaunchResult) {
  const kill = vi.fn();
  let onStart: () => void = () => {};
  const started = new Promise<void>(resolve => {
    onStart = resolve;
  });
  const run = vi.fn(() => {
    onStart();
    let stopped: (r: LaunchResult) => void = () => {};
    const exited = new Promise<LaunchResult>(resolve => {
      stopped = resolve;
    });
    kill.mockImplementation((signal = 'SIGTERM') =>
      stopped({ failed: true, message: `Command was killed with ${signal}` })
    );
    if (result) stopped(result);
    return Object.assign(exited, { kill });
  });
  return { run, kill, started };
}

/** The result of a build that exits 0. */
export const BUILD_OK: LaunchResult = { failed: false, message: '' };

/** The result of a build that exits 2, as execa words it. */
export const BUILD_FAILED: LaunchResult = {
  failed: true,
  message:
    'Command failed with exit code 2: pnpm exec turbo --no-update-notifier run build:package --filter=vercel',
};
