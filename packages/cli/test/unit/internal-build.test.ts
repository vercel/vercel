import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Client from '../../src/util/client';

const buildCommand = vi.hoisted(() => vi.fn());

vi.mock('../../src/commands/build/index.js', () => ({
  default: buildCommand,
}));
vi.mock('../../src/util/unexpected-error', () => ({
  exitWithUnexpectedError: vi.fn(),
  handleUnexpectedError: vi.fn(),
  registerUnexpectedErrorHandlers: vi.fn(),
}));
vi.mock('@vercel/detect-agent', () => ({
  determineAgent: async () => ({ isAgent: false }),
}));
const scheduleNativeAutoUpdate = vi.hoisted(() => vi.fn());
vi.mock('../../src/commands/version/native-auto-update', () => ({
  scheduleNativeAutoUpdate,
}));
const nativeInstall = vi.hoisted(() => ({ value: false }));
vi.mock('../../src/util/native-install', () => ({
  isNativeBinaryInstall: () => nativeInstall.value,
}));

const directEnv = {
  NO_UPDATE_NOTIFIER: '1',
  VERCEL_TELEMETRY_DISABLED: '1',
};

let root: string;
let globalDir: string;
let projectDir: string;
let originalArgv: string[];
let originalCwd: string;
let originalEnv: NodeJS.ProcessEnv;
let originalExitCode: typeof process.exitCode;

function setInvocation(args: string[], env: NodeJS.ProcessEnv = directEnv) {
  process.argv = [process.execPath, '/vercel/dist/vc.js', ...args];
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, { PATH: originalEnv.PATH }, env);
}

async function loadInternalBuild() {
  vi.resetModules();
  return import('../../src/internal-build');
}

beforeEach(async () => {
  root = await realpath(
    await mkdtemp(join(tmpdir(), 'vercel-internal-build-'))
  );
  globalDir = join(root, 'global');
  projectDir = join(root, 'project');
  await mkdir(projectDir);
  originalArgv = process.argv;
  originalCwd = process.cwd();
  originalEnv = { ...process.env };
  originalExitCode = process.exitCode;
  buildCommand.mockReset();
  scheduleNativeAutoUpdate.mockReset();
  nativeInstall.value = false;
  process.chdir(projectDir);
});

afterEach(async () => {
  process.argv = originalArgv;
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  process.exitCode = originalExitCode;
  await rm(root, { force: true, recursive: true });
});

describe('getDirectBuildFallbackReason', () => {
  const argv = (...args: string[]) => [process.execPath, 'vc.js', ...args];

  it('accepts the build container invocation', async () => {
    const { getDirectBuildFallbackReason } = await loadInternalBuild();
    expect(
      getDirectBuildFallbackReason(
        argv('build', '--output', '/tmp/out'),
        directEnv
      )
    ).toBeUndefined();
    expect(
      getDirectBuildFallbackReason(
        argv(
          'build',
          '--cwd',
          '/tmp/app',
          '--global-config',
          '/tmp/g',
          '--local-config',
          '/tmp/app/vercel.json',
          '--token',
          'abc',
          '--scope',
          'team',
          '--debug',
          '--no-color',
          '--non-interactive',
          '--prod',
          '--yes'
        ),
        { VERCEL: '1', VERCEL_TELEMETRY_DISABLED: '1' }
      )
    ).toBeUndefined();
  });

  it.each([
    [['deploy'], directEnv, 'not_build'],
    [['--cwd', '/tmp', 'build'], directEnv, 'not_build'],
    [['build', '--help'], directEnv, 'flag:--help'],
    [['build', '--version'], directEnv, 'flag:--version'],
    [['build', '--api', 'https://example.com'], directEnv, 'flag:--api'],
    [['build', '--team', 'acme'], directEnv, 'flag:--team'],
    [['build', '--project', 'app'], directEnv, 'project_scope'],
    [['build', '--project=app'], directEnv, 'project_scope'],
    [['build', '-p', 'app'], directEnv, 'project_scope'],
    [['build', '-yp', 'app'], directEnv, 'project_scope'],
    [['build', '--global-config'], directEnv, 'invalid_arguments'],
    [['build'], { ...directEnv, FORCE_TTY: '1' }, 'force_tty'],
    [['build'], { ...directEnv, FF_GUIDANCE_MODE: '1' }, 'guidance_mode'],
    [['build'], { NO_UPDATE_NOTIFIER: '1' }, 'telemetry_enabled'],
    [
      ['build'],
      { ...directEnv, VERCEL_TELEMETRY_DEBUG: '1' },
      'telemetry_debug',
    ],
    [['build'], { VERCEL_TELEMETRY_DISABLED: '1' }, 'update_check'],
  ])('falls back for %j with %j', async (args, env, reason) => {
    const { getDirectBuildFallbackReason } = await loadInternalBuild();
    expect(getDirectBuildFallbackReason(argv(...args), env)).toBe(reason);
  });

  it('ignores flags after the separator', async () => {
    const { getDirectBuildFallbackReason } = await loadInternalBuild();
    expect(
      getDirectBuildFallbackReason(
        argv('build', '--', '--project', 'app'),
        directEnv
      )
    ).toBeUndefined();
    expect(
      getDirectBuildFallbackReason(argv('build', '--', '-p', 'app'), directEnv)
    ).toBeUndefined();
  });
});

describe('runInternalBuild', () => {
  it('runs the build command with a client built from the invocation', async () => {
    const appDir = join(projectDir, 'app');
    await mkdir(appDir);
    await writeFile(
      join(appDir, 'custom.json'),
      JSON.stringify({ scope: 'from-local-config' })
    );
    const traceFile = join(root, 'out', 'diagnostics', 'cli_traces.json');
    let seen: Record<string, unknown> | undefined;
    buildCommand.mockImplementation(async (client: Client) => {
      seen = {
        argv: client.argv,
        authConfig: client.authConfig,
        cwd: client.cwd,
        localConfig: client.localConfig,
        localConfigPath: client.localConfigPath,
        nonInteractive: client.nonInteractive,
        rootSpan: Boolean(client.rootSpan),
      };
      client.traceDiagnosticsPath = traceFile;
      return 7;
    });
    setInvocation([
      'build',
      '--global-config',
      globalDir,
      '--local-config',
      'app/custom.json',
      '--cwd',
      appDir,
      '--token',
      'abc123',
      '--non-interactive',
    ]);

    const { runInternalBuild } = await loadInternalBuild();
    await expect(runInternalBuild()).resolves.toBe(7);

    expect(process.exitCode).toBe(7);
    expect(seen).toEqual({
      argv: process.argv,
      authConfig: { token: 'abc123', skipWrite: true, tokenSource: 'flag' },
      cwd: appDir,
      localConfig: expect.objectContaining({ scope: 'from-local-config' }),
      localConfigPath: 'app/custom.json',
      nonInteractive: true,
      rootSpan: true,
    });
    expect(existsSync(join(globalDir, 'config.json'))).toBe(true);
    const spans = JSON.parse(await readFile(traceFile, 'utf8')).map(
      (event: { name: string }) => event.name
    );
    expect(spans).toEqual(expect.arrayContaining(['vc.cli', 'vc.cli.command']));
  });

  it('uses VERCEL_TOKEN like the full CLI', async () => {
    buildCommand.mockImplementation(async (client: Client) => {
      expect(client.authConfig).toEqual({
        token: 'envtoken',
        skipWrite: true,
        tokenSource: 'env',
      });
      return 0;
    });
    setInvocation(['build', '--global-config', globalDir], {
      ...directEnv,
      VERCEL_TOKEN: 'envtoken',
    });

    const { runInternalBuild } = await loadInternalBuild();
    await expect(runInternalBuild()).resolves.toBe(0);
    expect(buildCommand).toHaveBeenCalledTimes(1);
  });

  it('never schedules a native auto-update', async () => {
    buildCommand.mockResolvedValue(0);
    nativeInstall.value = true;
    // The build container's handoff env need not carry NO_UPDATE_NOTIFIER or
    // VERCEL; the native install alone satisfies the update_check guard.
    setInvocation(['build', '--global-config', globalDir], {
      VERCEL_TELEMETRY_DISABLED: '1',
    });

    const { runInternalBuild } = await loadInternalBuild();
    await expect(runInternalBuild()).resolves.toBe(0);
    expect(buildCommand).toHaveBeenCalledTimes(1);
    expect(scheduleNativeAutoUpdate).not.toHaveBeenCalled();
  });

  it('rejects an invalid token before running the build', async () => {
    setInvocation(['build', '--global-config', globalDir, '--token', 'a b']);

    const { runInternalBuild } = await loadInternalBuild();
    // A malformed --token is a usage error, like in the full CLI.
    await expect(runInternalBuild()).resolves.toBe(2);
    expect(buildCommand).not.toHaveBeenCalled();
  });

  it('reports a missing --local-config file', async () => {
    setInvocation([
      'build',
      '--global-config',
      globalDir,
      '--local-config',
      'missing.json',
    ]);

    const { runInternalBuild } = await loadInternalBuild();
    await expect(runInternalBuild()).resolves.toBe(1);
    expect(buildCommand).not.toHaveBeenCalled();
  });

  it('exits 1 when the build command throws', async () => {
    buildCommand.mockRejectedValue(
      Object.assign(new Error('boom'), { code: 'E_BOOM' })
    );
    setInvocation(['build', '--global-config', globalDir]);

    const { runInternalBuild } = await loadInternalBuild();
    await expect(runInternalBuild()).resolves.toBe(1);
  });

  it('falls back without side effects', async () => {
    setInvocation(['build', '--global-config', globalDir, '--help']);

    const { runInternalBuild } = await loadInternalBuild();
    await expect(runInternalBuild()).resolves.toBeUndefined();
    expect(buildCommand).not.toHaveBeenCalled();
    expect(existsSync(globalDir)).toBe(false);
  });
});
