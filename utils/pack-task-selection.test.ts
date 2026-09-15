import { describe, expect, test } from 'vitest';
import {
  hoistRegistryDependenciesFromWorkspaceTarballs,
  pinWorkspacePeerDependencies,
  selectPackageTasks,
} from './pack-task-selection';
import { Task } from './types';

function task(packageName: string, taskName: string): Task {
  return {
    package: packageName,
    task: taskName,
    taskId: `${packageName}#${taskName}`,
  } as Task;
}

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
