import { afterEach, describe, expect, test } from 'vitest';
import {
  getWorkspaceInstallCommand,
  type WorkspaceInstallTarget,
} from '../src/fs/run-user-scripts';

const targets: WorkspaceInstallTarget[] = [
  {
    isRoot: true,
    name: 'fixture-root',
    packageJsonPath: '/repo/package.json',
    relativePath: '.',
  },
  {
    name: '@fixture/alpha',
    packageJsonPath: '/repo/services/alpha/package.json',
    relativePath: 'services/alpha',
  },
  {
    name: '@fixture/beta',
    packageJsonPath: '/repo/services/beta/package.json',
    relativePath: 'services/beta',
  },
];

afterEach(() => {
  delete process.env.NPM_ONLY_PRODUCTION;
});

describe('getWorkspaceInstallCommand', () => {
  test.each([
    [
      'npm' as const,
      3,
      [
        'install',
        '--no-audit',
        '--workspace=services/alpha',
        '--workspace=services/beta',
        '--include-workspace-root',
      ],
    ],
    [
      'pnpm' as const,
      9,
      [
        'install',
        '--filter',
        '{.}...',
        '--filter',
        '{services/alpha}...',
        '--filter',
        '{services/beta}...',
      ],
    ],
    [
      'yarn' as const,
      8,
      [
        'workspaces',
        'focus',
        'fixture-root',
        '@fixture/alpha',
        '@fixture/beta',
      ],
    ],
    [
      'bun' as const,
      1,
      [
        'install',
        '--filter',
        './',
        '--filter',
        './services/alpha',
        '--filter',
        './services/beta',
      ],
    ],
  ])('creates a scoped %s install', (packageManager, lockfileVersion, args) => {
    expect(
      getWorkspaceInstallCommand({
        packageManager,
        targets,
        lockfileVersion,
      })
    ).toEqual({ command: packageManager, args });
  });

  test.each([
    9, 10,
  ])('creates a scoped yarn install for lockfile version %s', lockfileVersion => {
    expect(
      getWorkspaceInstallCommand({
        packageManager: 'yarn',
        targets,
        lockfileVersion,
      })
    ).toEqual({
      command: 'yarn',
      args: [
        'workspaces',
        'focus',
        'fixture-root',
        '@fixture/alpha',
        '@fixture/beta',
      ],
    });
  });

  test('falls back for Yarn Classic', () => {
    expect(
      getWorkspaceInstallCommand({
        packageManager: 'yarn',
        targets,
        lockfileVersion: 1,
      })
    ).toBeNull();
  });

  test('falls back for an unnamed Yarn workspace', () => {
    expect(
      getWorkspaceInstallCommand({
        packageManager: 'yarn',
        targets: [{ ...targets[0], name: undefined }],
        lockfileVersion: 8,
      })
    ).toBeNull();
  });
});
