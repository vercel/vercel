import path from 'path';
import { runNpmInstall } from '../src';
const spawnMock = jest.spyOn(require('child_process'), 'spawn');

afterEach(() => {
  spawnMock.mockClear();
});

it('should not include peer dependencies when missing VERCEL_NPM_LEGACY_PEER_DEPS on node16', async () => {
  const fixture = path.join(__dirname, 'fixtures', '20-npm-7');
  const meta = {};
  const spawnOpts = undefined;
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
  const spawnOpts = {
    env: { ...process.env, VERCEL_NPM_LEGACY_PEER_DEPS: '1' },
  };
  const nodeVersion = { major: 16 } as any;
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
  const spawnOpts = {
    env: { ...process.env, VERCEL_NPM_LEGACY_PEER_DEPS: '1' },
  };
  const nodeVersion = { major: 14 } as any;
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
