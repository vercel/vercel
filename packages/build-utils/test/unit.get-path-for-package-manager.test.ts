import { delimiter } from 'path';
import { getPathForPackageManager } from '../src';
import { describe, test, expect } from 'vitest';

describe('Test `getPathForPackageManager()`', () => {
  test.each<{
    name: string;
    args: Parameters<typeof getPathForPackageManager>[0];
    want: unknown;
  }>([
    {
      name: 'should do nothing to env for npm < 6 and node < 16',
      args: {
        cliType: 'npm',
        nodeVersion: { major: 14, range: '14.x', runtime: 'nodejs14.x' },
        lockfileVersion: 1,
        env: {
          FOO: 'bar',
        },
        detectedLockfile: 'package-lock.json',
      },
      want: {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should not set npm path if corepack enabled',
      args: {
        cliType: 'npm',
        nodeVersion: { major: 14, range: '14.x', runtime: 'nodejs14.x' },
        lockfileVersion: 2,
        env: {
          FOO: 'bar',
          ENABLE_EXPERIMENTAL_COREPACK: '1',
        },
        detectedLockfile: 'package-lock.json',
      },
      want: {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should not prepend npm path again if already detected',
      args: {
        cliType: 'npm',
        nodeVersion: { major: 14, range: '14.x', runtime: 'nodejs14.x' },
        lockfileVersion: 2,
        env: {
          FOO: 'bar',
          PATH: `/node16/bin-npm7${delimiter}foo`,
        },
        detectedLockfile: 'package-lock.json',
      },
      want: {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should not set path if node is 16 and npm 7+ is detected',
      args: {
        cliType: 'npm',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        lockfileVersion: 2,
        env: {
          FOO: 'bar',
          PATH: 'foo',
        },
        detectedLockfile: 'package-lock.json',
      },
      want: {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should set YARN_NODE_LINKER w/yarn if it is not already defined',
      args: {
        cliType: 'yarn',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        lockfileVersion: 2,
        env: {
          FOO: 'bar',
        },
        detectedLockfile: 'yarn.lock',
      },
      want: {
        detectedLockfile: 'yarn.lock',
        detectedPackageManager: 'yarn',
        path: undefined,
        yarnNodeLinker: 'node-modules',
      },
    },
    {
      name: 'should not set YARN_NODE_LINKER if it already exists',
      args: {
        cliType: 'yarn',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        lockfileVersion: 2,
        env: {
          FOO: 'bar',
          YARN_NODE_LINKER: 'exists',
        },
        detectedLockfile: 'yarn.lock',
      },
      want: {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should set path if pnpm 7+ is detected',
      args: {
        cliType: 'pnpm',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        lockfileVersion: 5.4,
        env: {
          FOO: 'bar',
          PATH: 'foo',
        },
        detectedLockfile: 'pnpm-lock.yaml',
      },
      want: {
        detectedLockfile: 'pnpm-lock.yaml',
        detectedPackageManager: 'pnpm@7.x',
        pnpmVersionRange: '7.x',
        path: '/pnpm7/node_modules/.bin',
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should set path if bun v1 is detected',
      args: {
        cliType: 'bun',
        nodeVersion: { major: 18, range: '18.x', runtime: 'nodejs18.x' },
        lockfileVersion: 0,
        env: {
          FOO: 'bar',
          PATH: '/usr/local/bin',
        },
        detectedLockfile: 'bun.lockb',
      },
      want: {
        detectedLockfile: 'bun.lockb',
        detectedPackageManager: 'bun@1.x',
        path: '/bun1',
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should not set pnpm path if corepack is enabled',
      args: {
        cliType: 'pnpm',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        lockfileVersion: 5.4,
        env: {
          FOO: 'bar',
          ENABLE_EXPERIMENTAL_COREPACK: '1',
        },
        detectedLockfile: 'pnpm-lock.yaml',
      },
      want: {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      },
    },
    {
      name: 'should not prepend pnpm path again if already detected',
      args: {
        cliType: 'pnpm',
        nodeVersion: { major: 16, range: '16.x', runtime: 'nodejs16.x' },
        lockfileVersion: 5.4,
        env: {
          FOO: 'bar',
          PATH: `/pnpm7/node_modules/.bin${delimiter}foo`,
        },
        detectedLockfile: 'pnpm-lock.yaml',
      },
      want: {
        detectedLockfile: undefined,
        detectedPackageManager: undefined,
        path: undefined,
        yarnNodeLinker: undefined,
      },
    },
  ])('$name', ({ args, want }) => {
    expect(
      getPathForPackageManager({
        cliType: args.cliType,
        lockfileVersion: args.lockfileVersion,
        nodeVersion: args.nodeVersion,
        env: args.env,
        detectedLockfile: args.detectedLockfile,
      })
    ).toStrictEqual(want);
  });
});
