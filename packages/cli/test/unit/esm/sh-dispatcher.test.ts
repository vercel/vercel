import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  mkdtempSync,
  removeSync,
  mkdirpSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  existsSync,
} from 'fs-extra';

// Drives the real src/vc.sh through sh, with a fake `node` and fake
// payloads, to prove dispatch decisions without booting the actual CLI.

const DISPATCHER_SRC = join(__dirname, '../../../src/vc.sh');
const IS_WIN = process.platform === 'win32';

let root: string; // sandbox: fake global install, fake store, fake PATH

function setup(opts: { version?: string } = {}) {
  const version = opts.version ?? '54.0.0';

  // Fake "global install": <root>/pnpm-home/global/bin/vc -> pkg/vc.sh
  const pnpmHome = join(root, 'pnpm-home');
  const pkgDir = join(pnpmHome, 'global', 'node_modules', 'vercel', 'dist');
  mkdirpSync(pkgDir);

  const dispatcher = readFileSync(DISPATCHER_SRC, 'utf8').replace(
    'VERSION="0.0.0-dev"',
    `VERSION="${version}"`
  );
  writeFileSync(join(pkgDir, 'vc.sh'), dispatcher, { mode: 0o755 });
  // The invoked install's own payload: proves fall-through cases.
  writeFileSync(join(pkgDir, 'vc.js'), '// own payload\n');

  const binDir = join(pnpmHome, 'bin');
  mkdirpSync(binDir);
  symlinkSync(join(pkgDir, 'vc.sh'), join(binDir, 'vc'));

  // Fake node on PATH: records what it was asked to run.
  const fakeBin = join(root, 'fakebin');
  mkdirpSync(fakeBin);
  writeFileSync(
    join(fakeBin, 'node'),
    `#!/bin/sh\necho "node-ran: $1" >> "${root}/exec.log"\necho "args: $2 $3" >> "${root}/exec.log"\n`,
    { mode: 0o755 }
  );

  const store = join(root, 'store');
  mkdirpSync(store);

  return { pnpmHome, binDir, pkgDir, fakeBin, store };
}

function invoke(
  ctx: ReturnType<typeof setup>,
  args: string[],
  env: Record<string, string> = {}
): string {
  return execFileSync('sh', [join(ctx.binDir, 'vc'), ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${ctx.fakeBin}:/usr/bin:/bin`,
      HOME: root,
      PNPM_HOME: ctx.pnpmHome,
      VERCEL_CLI_STORE_DIR: ctx.store,
      ...env,
    },
  });
}

function execLog(): string {
  const p = join(root, 'exec.log');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function writePointer(store: string, version: string, path: string) {
  writeFileSync(join(store, 'current.path'), `${version}\n${path}\n`);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vc-sh-test-'));
});

afterEach(() => {
  removeSync(root);
});

describe.skipIf(IS_WIN)('sh dispatcher', () => {
  it('runs its own vc.js when the store is not enabled', () => {
    const ctx = setup();
    writePointer(ctx.store, '55.0.0', join(ctx.store, 'nope.js'));
    invoke(ctx, ['whoami']);
    expect(execLog()).toContain(`node-ran: ${join(ctx.pkgDir, 'vc.js')}`);
  });

  it('runs its own vc.js when enabled but no pointer exists', () => {
    const ctx = setup();
    invoke(ctx, ['whoami'], { VERCEL_CLI_STORE: '1' });
    expect(execLog()).toContain(`node-ran: ${join(ctx.pkgDir, 'vc.js')}`);
  });

  it('redirects to a newer npm payload via node', () => {
    const ctx = setup({ version: '54.0.0' });
    const payload = join(ctx.store, 'versions/npm/55.0.0/dist/vc.js');
    mkdirpSync(join(payload, '..'));
    writeFileSync(payload, '// store payload\n');
    writePointer(ctx.store, '55.0.0', payload);

    invoke(ctx, ['whoami'], { VERCEL_CLI_STORE: '1' });
    expect(execLog()).toContain(`node-ran: ${payload}`);
    expect(execLog()).toContain('args: whoami');
  });

  it('execs a native payload directly — no node at all', () => {
    const ctx = setup({ version: '54.0.0' });
    const payload = join(ctx.store, 'versions/native/55.0.0/bin/vercel');
    mkdirpSync(join(payload, '..'));
    writeFileSync(
      payload,
      `#!/bin/sh\necho "native-ran: $*"\necho "redirected=$VERCEL_CLI_STORE_REDIRECTED"\n`,
      { mode: 0o755 }
    );
    writePointer(ctx.store, '55.0.0', payload);

    const out = invoke(ctx, ['whoami', '--yes'], { VERCEL_CLI_STORE: '1' });
    expect(out).toContain('native-ran: whoami --yes');
    expect(out).toContain('redirected=1'); // loop guard exported
    expect(execLog()).toBe(''); // node never started
  });

  it('does not self-redirect when the pointer is its own version', () => {
    const ctx = setup({ version: '54.0.0' });
    const payload = join(ctx.store, 'versions/npm/54.0.0/dist/vc.js');
    mkdirpSync(join(payload, '..'));
    writeFileSync(payload, '// same version\n');
    writePointer(ctx.store, '54.0.0', payload);

    invoke(ctx, ['whoami'], { VERCEL_CLI_STORE: '1' });
    expect(execLog()).toContain(`node-ran: ${join(ctx.pkgDir, 'vc.js')}`);
  });

  it('falls through when the pointed payload is missing', () => {
    const ctx = setup();
    writePointer(ctx.store, '55.0.0', join(ctx.store, 'missing.js'));
    invoke(ctx, ['whoami'], { VERCEL_CLI_STORE: '1' });
    expect(execLog()).toContain(`node-ran: ${join(ctx.pkgDir, 'vc.js')}`);
  });

  it('honors the loop guard', () => {
    const ctx = setup();
    const payload = join(ctx.store, 'versions/npm/55.0.0/dist/vc.js');
    mkdirpSync(join(payload, '..'));
    writeFileSync(payload, '// store payload\n');
    writePointer(ctx.store, '55.0.0', payload);

    invoke(ctx, ['whoami'], {
      VERCEL_CLI_STORE: '1',
      VERCEL_CLI_STORE_REDIRECTED: '1',
    });
    expect(execLog()).toContain(`node-ran: ${join(ctx.pkgDir, 'vc.js')}`);
  });

  it('does not redirect a non-global (project-local) install', () => {
    const ctx = setup();
    // A copy of the dispatcher living OUTSIDE PNPM_HOME and any node root.
    const localDir = join(root, 'some-project', 'node_modules', '.bin-src');
    mkdirpSync(localDir);
    const dispatcher = readFileSync(DISPATCHER_SRC, 'utf8').replace(
      'VERSION="0.0.0-dev"',
      'VERSION="54.0.0"'
    );
    writeFileSync(join(localDir, 'vc.sh'), dispatcher, { mode: 0o755 });
    writeFileSync(join(localDir, 'vc.js'), '// local payload\n');

    const payload = join(ctx.store, 'versions/npm/55.0.0/dist/vc.js');
    mkdirpSync(join(payload, '..'));
    writeFileSync(payload, '// store payload\n');
    writePointer(ctx.store, '55.0.0', payload);

    execFileSync('sh', [join(localDir, 'vc.sh'), 'whoami'], {
      encoding: 'utf8',
      env: {
        PATH: `${ctx.fakeBin}:/usr/bin:/bin`,
        HOME: root,
        PNPM_HOME: ctx.pnpmHome,
        VERCEL_CLI_STORE_DIR: ctx.store,
        VERCEL_CLI_STORE: '1',
      },
    });
    // Ran the local payload, not the store's newer version.
    expect(execLog()).toContain(`node-ran: ${join(localDir, 'vc.js')}`);
    expect(execLog()).not.toContain('55.0.0');
  });

  it('treats an npm-global install (under node prefix) as eligible', () => {
    const ctx = setup();
    // Fake node prefix layout: <prefix>/bin/node + <prefix>/lib/node_modules
    const prefix = join(root, 'node-prefix');
    const npmGlobalDir = join(prefix, 'lib/node_modules/vercel/dist');
    mkdirpSync(join(prefix, 'bin'));
    mkdirpSync(npmGlobalDir);
    writeFileSync(
      join(prefix, 'bin', 'node'),
      `#!/bin/sh\necho "node-ran: $1" >> "${root}/exec.log"\n`,
      { mode: 0o755 }
    );
    const dispatcher = readFileSync(DISPATCHER_SRC, 'utf8').replace(
      'VERSION="0.0.0-dev"',
      'VERSION="54.0.0"'
    );
    writeFileSync(join(npmGlobalDir, 'vc.sh'), dispatcher, { mode: 0o755 });
    writeFileSync(join(npmGlobalDir, 'vc.js'), '// own\n');

    const payload = join(ctx.store, 'versions/npm/55.0.0/dist/vc.js');
    mkdirpSync(join(payload, '..'));
    writeFileSync(payload, '// store payload\n');
    writePointer(ctx.store, '55.0.0', payload);

    execFileSync('sh', [join(npmGlobalDir, 'vc.sh'), 'whoami'], {
      encoding: 'utf8',
      env: {
        // node resolves from the fake prefix — that's the eligibility fact
        PATH: `${join(prefix, 'bin')}:/usr/bin:/bin`,
        HOME: root,
        VERCEL_CLI_STORE_DIR: ctx.store,
        VERCEL_CLI_STORE: '1',
      },
    });
    expect(execLog()).toContain(`node-ran: ${payload}`);
  });

  it('emits debug decisions and spawns background work with DEBUG=1', () => {
    const ctx = setup({ version: '54.0.0' });
    const payload = join(ctx.store, 'versions/npm/55.0.0/dist/vc.js');
    mkdirpSync(join(payload, '..'));
    writeFileSync(payload, '// store payload\n');
    writePointer(ctx.store, '55.0.0', payload);

    const stderr = execFileSync('sh', [join(ctx.binDir, 'vc'), 'whoami'], {
      encoding: 'utf8',
      env: {
        PATH: `${ctx.fakeBin}:/usr/bin:/bin`,
        HOME: root,
        PNPM_HOME: ctx.pnpmHome,
        VERCEL_CLI_STORE_DIR: ctx.store,
        VERCEL_CLI_STORE: '1',
        VERCEL_CLI_STORE_DEBUG: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // stderr comes via exceptions only with pipe; use a spawn that captures.
    void stderr;
    const log = join(ctx.store, 'seed-debug.log');
    expect(existsSync(log)).toBe(true);
    expect(readFileSync(log, 'utf8')).toContain('seed-check: invoked v54.0.0');
  });

  it('vc -v --verbose reports dispatch info and runs the invoked copy', () => {
    const ctx = setup({ version: '54.0.0' });
    const payload = join(ctx.store, 'versions/npm/55.0.0/dist/vc.js');
    mkdirpSync(join(payload, '..'));
    writeFileSync(payload, '// store payload\n');
    writePointer(ctx.store, '55.0.0', payload);

    const result = execFileSync(
      'sh',
      ['-c', `"${join(ctx.binDir, 'vc')}" -v --verbose 2>&1`],
      {
        encoding: 'utf8',
        env: {
          PATH: `${ctx.fakeBin}:/usr/bin:/bin`,
          HOME: root,
          PNPM_HOME: ctx.pnpmHome,
          VERCEL_CLI_STORE_DIR: ctx.store,
          VERCEL_CLI_STORE: '1',
        },
      }
    );
    expect(result).toContain('version:    54.0.0');
    expect(result).toContain('global:     1');
    expect(result).toContain(`(v55.0.0)`);
    // and it ran the invoked copy, not the store
    expect(execLog()).toContain(`node-ran: ${join(ctx.pkgDir, 'vc.js')}`);
  });
});
