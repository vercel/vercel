let spawnExitCode = 0;

const spawnMock = jest.fn();
jest.mock('cross-spawn', () => {
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
  return spawn;
});

afterEach(() => {
  spawnExitCode = 0;
  spawnMock.mockClear();
});

import path from 'path';
import { runNpmInstall, cloneEnv } from '../src';
import type { Meta } from '../src/types';

function getTestSpawnOpts(env: Record<string, string>) {
  return { env: cloneEnv(process.env, env) };
}

function getNodeVersion(major: number) {
  return { major, range: `${major}.x`, runtime: `nodejs${major}.x` };
}

it('should not include peer dependencies when missing VERCEL_NPM_LEGACY_PEER_DEPS on node16', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const meta: Meta = {};
  const spawnOpts = getTestSpawnOpts({});
  const nodeVersion = getNodeVersion(16);
  await runNpmInstall(fixture, [], spawnOpts, meta, nodeVersion);
  expect(spawnMock.mock.calls.length).toBe(1);
  const args = spawnMock.mock.calls[0];
  expect(args[0]).toEqual('npm');
  expect(args[1]).toEqual(['install', '--no-audit', '--unsafe-perm']);
  expect(args[2]).toEqual({
    cwd: fixture,
    prettyCommand: 'npm install',
    stdio: 'inherit',
    env: expect.any(Object),
  });
});

it('should include peer dependencies when VERCEL_NPM_LEGACY_PEER_DEPS=1 on node16', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const meta: Meta = {};
  const spawnOpts = getTestSpawnOpts({ VERCEL_NPM_LEGACY_PEER_DEPS: '1' });
  const nodeVersion = getNodeVersion(16);
  await runNpmInstall(fixture, [], spawnOpts, meta, nodeVersion);
  expect(spawnMock.mock.calls.length).toBe(1);
  const args = spawnMock.mock.calls[0];
  expect(args[0]).toEqual('npm');
  expect(args[1]).toEqual([
    'install',
    '--no-audit',
    '--unsafe-perm',
    '--legacy-peer-deps',
  ]);
  expect(args[2]).toEqual({
    cwd: fixture,
    prettyCommand: 'npm install',
    stdio: 'inherit',
    env: expect.any(Object),
  });
});

it('should include peer dependencies when VERCEL_NPM_LEGACY_PEER_DEPS=1 on node14 and npm7+', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const meta: Meta = {};
  const spawnOpts = getTestSpawnOpts({ VERCEL_NPM_LEGACY_PEER_DEPS: '1' });

  const nodeVersion = getNodeVersion(14);
  await runNpmInstall(fixture, [], spawnOpts, meta, nodeVersion);
  expect(spawnMock.mock.calls.length).toBe(1);
  const args = spawnMock.mock.calls[0];
  expect(args[0]).toEqual('npm');
  expect(args[1]).toEqual([
    'install',
    '--no-audit',
    '--unsafe-perm',
    '--legacy-peer-deps',
  ]);
  expect(args[2]).toEqual({
    cwd: fixture,
    prettyCommand: 'npm install',
    stdio: 'inherit',
    env: expect.any(Object),
  });
});

it('should not include peer dependencies when VERCEL_NPM_LEGACY_PEER_DEPS=1 on node14 and npm6', async () => {
  const fixture = path.join(__dirname, 'fixtures', '14-npm-6-legacy-peer-deps');
  const meta: Meta = {};
  const spawnOpts = getTestSpawnOpts({ VERCEL_NPM_LEGACY_PEER_DEPS: '1' });

  const nodeVersion = getNodeVersion(14);
  await runNpmInstall(fixture, [], spawnOpts, meta, nodeVersion);
  expect(spawnMock.mock.calls.length).toBe(1);
  const args = spawnMock.mock.calls[0];
  expect(args[0]).toEqual('npm');
  expect(args[1]).toEqual(['install', '--no-audit', '--unsafe-perm']);
  expect(args[2]).toEqual({
    cwd: fixture,
    prettyCommand: 'npm install',
    stdio: 'inherit',
    env: expect.any(Object),
  });
});

it('should not include peer dependencies when VERCEL_NPM_LEGACY_PEER_DEPS=1 on node16 with corepack enabled', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const meta: Meta = {};
  const spawnOpts = getTestSpawnOpts({
    VERCEL_NPM_LEGACY_PEER_DEPS: '1',
    ENABLE_EXPERIMENTAL_COREPACK: '1',
  });
  const nodeVersion = getNodeVersion(16);
  await runNpmInstall(fixture, [], spawnOpts, meta, nodeVersion);
  expect(spawnMock.mock.calls.length).toBe(1);
  const args = spawnMock.mock.calls[0];
  expect(args[0]).toEqual('npm');
  expect(args[1]).toEqual(['install', '--no-audit', '--unsafe-perm']);
  expect(args[2]).toEqual({
    cwd: fixture,
    prettyCommand: 'npm install',
    stdio: 'inherit',
    env: expect.any(Object),
  });
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
