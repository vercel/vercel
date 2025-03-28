import path from 'path';
import { runNpmInstall } from '../src';
import type { Meta } from '../src/types';
import { afterEach, expect, it, vi } from 'vitest';

let spawnExitCode = 0;

const spawnMock = vi.fn();
vi.mock('cross-spawn', () => {
  const spawn = (...args: any) => {
    spawnMock(...args);
    const child = {
      on: (type: string, fn: (code: number) => void) => {
        if (type === 'close') {
          return fn(spawnExitCode);
        }
      },
    };
    return child;
  };
  return { default: spawn };
});

afterEach(() => {
  spawnExitCode = 0;
  spawnMock.mockClear();
});

it('should only invoke `runNpmInstall()` once per `package.json` file (serial)', async () => {
  const meta: Meta = {};
  const fixture = path.join(__dirname, 'fixtures', '02-zero-config-api');
  const apiDir = path.join(fixture, 'api');

  const run1 = await runNpmInstall(apiDir, [], undefined, meta);
  expect(run1).toEqual(true);
  expect(
    (meta.runNpmInstallSet as Set<string>).has(
      path.join(fixture, 'package.json')
    )
  ).toEqual(true);

  const run2 = await runNpmInstall(apiDir, [], undefined, meta);
  expect(run2).toEqual(false);

  const run3 = await runNpmInstall(fixture, [], undefined, meta);
  expect(run3).toEqual(false);

  expect(spawnMock.mock.calls.length).toBe(1);
  const args = spawnMock.mock.calls[0];
  expect(args[0]).toEqual('yarn');
  expect(args[1]).toEqual(['install']);
  expect(args[2]).toEqual({
    cwd: apiDir,
    prettyCommand: 'yarn install',
    stdio: 'inherit',
    env: expect.any(Object),
  });
});

it('should only invoke `runNpmInstall()` once per `package.json` file (parallel)', async () => {
  const meta: Meta = {};
  const fixture = path.join(__dirname, 'fixtures', '02-zero-config-api');
  const apiDir = path.join(fixture, 'api');
  const [run1, run2, run3] = await Promise.all([
    runNpmInstall(apiDir, [], undefined, meta),
    runNpmInstall(apiDir, [], undefined, meta),
    runNpmInstall(fixture, [], undefined, meta),
  ]);
  expect(run1).toEqual(true);
  expect(run2).toEqual(false);
  expect(run3).toEqual(false);
  expect(
    (meta.runNpmInstallSet as Set<string>).has(
      path.join(fixture, 'package.json')
    )
  ).toEqual(true);

  expect(spawnMock.mock.calls.length).toBe(1);
  const args = spawnMock.mock.calls[0];
  expect(args[0]).toEqual('yarn');
  expect(args[1]).toEqual(['install']);
  expect(args[2]).toEqual({
    cwd: apiDir,
    prettyCommand: 'yarn install',
    stdio: 'inherit',
    env: expect.any(Object),
  });
});

it('should print warning for yarn dynamic require bug', async () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn');
  process.env.ENABLE_EXPERIMENTAL_COREPACK = '1';

  const fixture = path.join(__dirname, 'fixtures', '46-yarn-dynamic-require');
  await expect(runNpmInstall(fixture, [], undefined, {})).resolves.toBe(true);

  expect(consoleWarnSpy).toHaveBeenCalledWith(
    expect.stringContaining(
      'Warning: This project may see "Error: Dynamic require of "util" is not supported". To avoid this error, remove `"type": "module"` from your package.json file, or use `yarnPath` instead of Corepack. Learn more: https://vercel.com/docs/errors/error-list#yarn-dynamic-require-of-util-is-not-supported'
    )
  );

  consoleWarnSpy.mockRestore();
  delete process.env.ENABLE_EXPERIMENTAL_COREPACK;
});

it('should throw error when install failed - yarn', async () => {
  spawnExitCode = 1;
  const meta: Meta = {};
  const fixture = path.join(__dirname, 'fixtures', '19-yarn-v2');
  await expect(
    runNpmInstall(fixture, [], undefined, meta)
  ).rejects.toMatchObject({
    name: 'Error',
    message: 'Command "yarn install" exited with 1',
  });
});

it('should throw error when install failed - npm', async () => {
  spawnExitCode = 1;
  const meta: Meta = {};
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  await expect(
    runNpmInstall(fixture, [], undefined, meta)
  ).rejects.toMatchObject({
    name: 'Error',
    message: 'Command "npm install" exited with 1',
  });
});

it('should disable global cache for yarn 3+', async () => {
  const fixture = path.join(__dirname, 'fixtures', '44-yarn-v4');
  expect(await runNpmInstall(fixture, [], undefined, {})).toEqual(true);

  expect(spawnMock.mock.calls.length).toBe(2);
  const yarnConfig = spawnMock.mock.calls[0];
  expect(yarnConfig[0]).toEqual('yarn');
  expect(yarnConfig[1]).toEqual([
    'config',
    'set',
    'enableGlobalCache',
    'false',
  ]);

  const yarnInstall = spawnMock.mock.calls[1];
  expect(yarnInstall[0]).toEqual('yarn');
  expect(yarnInstall[1]).toEqual(['install']);
});

it('should not disable global cache for yarn 1', async () => {
  const fixture = path.join(__dirname, 'fixtures', '45-yarn-v1');
  expect(await runNpmInstall(fixture, [], undefined, {})).toEqual(true);

  expect(spawnMock.mock.calls.length).toBe(1);

  const yarnInstall = spawnMock.mock.calls[0];
  expect(yarnInstall[0]).toEqual('yarn');
  expect(yarnInstall[1]).toEqual(['install']);
});
