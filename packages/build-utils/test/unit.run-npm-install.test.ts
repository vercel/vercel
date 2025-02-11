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
