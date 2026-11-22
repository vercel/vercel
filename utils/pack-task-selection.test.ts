import { describe, expect, test } from 'vitest';
import {
  hoistRegistryDependenciesFromWorkspaceTarballs,
  pinWorkspacePeerDependencies,
  selectPackageTasks,
  toSemverPreviewIdentifier,
} from './pack-task-selection';
import { Task } from './types';

function task(packageName: string, taskName: string): Task {
  return {
    package: packageName,
    task: taskName,
    taskId: `${packageName}#${taskName}`,
  } as Task;
}

describe('toSemverPreviewIdentifier', () => {
  test('leaves hex shas containing a letter untouched', () => {
    expect(toSemverPreviewIdentifier('a1b2c3d')).toBe('a1b2c3d');
    expect(toSemverPreviewIdentifier('abcdef1')).toBe('abcdef1');
  });

  test('prefixes all-digit shas so leading zeroes stay valid semver', () => {
    // A prerelease identifier made only of digits is "numeric" per semver,
    // and semver forbids leading zeroes on numeric identifiers. Left alone,
    // `0749271` produces an invalid version string for strict parsers (npm
    // rejected `0.2.7-0749271` outright) and gets silently truncated to
    // `749271` by looser ones, corrupting the identifier either way.
    expect(toSemverPreviewIdentifier('0749271')).toBe('g0749271');
    expect(/^0\d/.test(toSemverPreviewIdentifier('0749271'))).toBe(false);
  });

  test('also guards all-digit shas without a leading zero for consistency', () => {
    expect(toSemverPreviewIdentifier('2816496')).toBe('g2816496');
  });
});

describe('pinWorkspacePeerDependencies', () => {
  test('pins workspace peers to their preview versions', () => {
    const packageObj = {
      peerDependencies: {
        '@vercel/build-utils': 'workspace:*',
        react: '^18.0.0',
      },
    };

    pinWorkspacePeerDependencies(
      packageObj,
      new Map([
        ['@vercel/build-utils', '14.5.0'],
        ['react', '18.3.0'],
      ]),
      '2816496'
    );

    expect(packageObj.peerDependencies).toEqual({
      '@vercel/build-utils': '14.5.0-2816496',
      react: '^18.0.0',
    });
  });
});

describe('hoistRegistryDependenciesFromWorkspaceTarballs', () => {
  test('copies registry deps of tarball-pinned workspace packages onto the parent', () => {
    const packageObj = {
      dependencies: {
        '@vercel/python-analysis':
          'https://preview.vercel.sh/tarballs/vercel-python-analysis.tgz',
        '@vercel/python':
          'https://preview.vercel.sh/tarballs/vercel-python.tgz',
        zod: '4.1.11',
      },
    };

    hoistRegistryDependenciesFromWorkspaceTarballs(
      packageObj,
      new Map([
        [
          '@vercel/python-analysis',
          {
            'js-yaml': '4.1.1',
            zod: '3.22.4',
            '@vercel/error-utils': 'workspace:*',
          },
        ],
        ['@vercel/python', { '@vercel/python-analysis': 'workspace:*' }],
        ['@vercel/error-utils', { 'fs-extra': '10.0.0' }],
      ])
    );

    expect(packageObj.dependencies).toEqual({
      '@vercel/python-analysis':
        'https://preview.vercel.sh/tarballs/vercel-python-analysis.tgz',
      '@vercel/python': 'https://preview.vercel.sh/tarballs/vercel-python.tgz',
      // Parent already has zod; do not overwrite with python-analysis's major.
      zod: '4.1.11',
      'js-yaml': '4.1.1',
      'fs-extra': '10.0.0',
    });
  });
});

describe('selectPackageTasks', () => {
  test('prefers one package barrier and retains transit-only builds', () => {
    expect(
      selectPackageTasks([
        task('with-barrier', 'build'),
        task('transit-only', 'build'),
        task('with-barrier', 'build:package'),
        task('unrelated', 'test'),
      ]).map(({ taskId }) => taskId)
    ).toEqual(['with-barrier#build:package', 'transit-only#build']);
  });
});
