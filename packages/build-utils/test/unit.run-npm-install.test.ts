const spawnMock = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: any) => {
    spawnMock(...args);
    const child = {
      on: (type: string, fn: (code: number) => void) => {
        if (type === 'close') {
          return fn(0);
        }
      },
    };
    return child;
  },
}));

afterEach(() => {
  spawnMock.mockClear();
});

import path from 'path';
import { runNpmInstall, cloneEnv } from '../src';

function getTestSpawnOpts(env: Record<string, string>) {
  return { env: cloneEnv(process.env, env) };
}

function getNodeVersion(major: number) {
  return { major, range: `${major}.x`, runtime: `nodejs${major}.x` };
}

it('should not include peer dependencies when missing VERCEL_NPM_LEGACY_PEER_DEPS on node16', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const meta = {};
  const spawnOpts = getTestSpawnOpts({});
  const nodeVersion = { major: 16 } as any;
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
  const meta = {};
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

it('should not include peer dependencies when VERCEL_NPM_LEGACY_PEER_DEPS=1 on node14', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const meta = {};
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
  const meta = {};
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
