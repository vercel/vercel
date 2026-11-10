import { describe, expect, test } from 'vitest';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import type { NodejsLambda } from '@vercel/build-utils';
import { build } from '../../src';
import { normalizePath, prepareFilesystem } from './test-utils';

function useWorkspace(
  filesystem: Awaited<ReturnType<typeof prepareFilesystem>>,
  relativeWorkPath: string,
  entrypoint: string
) {
  filesystem.files[entrypoint] =
    filesystem.files[normalizePath(join(relativeWorkPath, entrypoint))];
  return {
    ...filesystem,
    workPath: join(filesystem.repoRootPath, relativeWorkPath),
  };
}

const skipInstall = {
  considerBuildCommand: true,
  config: { projectSettings: { installCommand: '' } },
} as const;

async function addFileSymlink(
  filesystem: Awaited<ReturnType<typeof prepareFilesystem>>,
  linkPath: string,
  targetPath: string
) {
  const absoluteLink = join(filesystem.workPath, linkPath);
  await fs.mkdir(dirname(absoluteLink), { recursive: true });
  await fs.symlink(targetPath, absoluteLink, 'file');
  filesystem.files[linkPath] = await (
    await import('@vercel/build-utils')
  ).FileFsRef.fromFsPath({ fsPath: absoluteLink });
}

async function addDirectorySymlink(
  filesystem: Awaited<ReturnType<typeof prepareFilesystem>>,
  linkPath: string,
  targetPath: string
) {
  const absoluteLink = join(filesystem.workPath, linkPath);
  await fs.mkdir(dirname(absoluteLink), { recursive: true });
  await fs.symlink(targetPath, absoluteLink, 'dir');
  filesystem.files[linkPath] = await (
    await import('@vercel/build-utils')
  ).FileFsRef.fromFsPath({ fsPath: absoluteLink });
}

describe('workspace tracing contract', () => {
  test('traces a hoisted dependency from the repository root', async () => {
    const filesystem = await prepareFilesystem(
      {
        'package.json': JSON.stringify({
          private: true,
          workspaces: ['apps/*'],
        }),
        'node_modules/hoisted/package.json': JSON.stringify({
          name: 'hoisted',
          version: '1.0.0',
          main: 'index.js',
        }),
        'node_modules/hoisted/index.js': `module.exports = 'hoisted';`,
        'apps/api/package.json': JSON.stringify({
          name: '@workspace/api',
          dependencies: { hoisted: '1.0.0' },
        }),
        'apps/api/index.js': `
          const value = require('hoisted');
          module.exports = (_req, res) => res.end(value);
        `,
      },
      'vercel-node-workspace-hoisted'
    );

    const result = await build({
      ...useWorkspace(filesystem, 'apps/api', 'index.js'),
      ...skipInstall,
      entrypoint: 'index.js',
      meta: { skipDownload: true },
    });
    const files = Object.keys((result.output as NodejsLambda).files).map(
      normalizePath
    );

    expect(files).toContain('apps/api/index.js');
    expect(files).toContain('node_modules/hoisted/index.js');
    expect(files).toContain('node_modules/hoisted/package.json');
  });

  test.skipIf(process.platform === 'win32')(
    'traces a workspace package linked through node_modules',
    async () => {
      const filesystem = await prepareFilesystem(
        {
          'package.json': JSON.stringify({
            private: true,
            workspaces: ['apps/*', 'packages/*'],
          }),
          'apps/api/package.json': JSON.stringify({
            name: '@workspace/api',
            dependencies: { '@workspace/shared': 'workspace:*' },
          }),
          'apps/api/index.js': `
          const { value } = require('@workspace/shared');
          module.exports = (_req, res) => res.end(value);
        `,
          'packages/shared/package.json': JSON.stringify({
            name: '@workspace/shared',
            version: '1.0.0',
            main: 'dist/index.js',
          }),
          'packages/shared/dist/index.js': `exports.value = 'shared';`,
          'packages/shared/dist/sidecar.json': JSON.stringify({
            sidecar: true,
          }),
        },
        'vercel-node-workspace-link'
      );

      await addDirectorySymlink(
        filesystem,
        'node_modules/@workspace/shared',
        '../../../packages/shared'
      );

      const result = await build({
        ...useWorkspace(filesystem, 'apps/api', 'index.js'),
        ...skipInstall,
        entrypoint: 'index.js',
        meta: { skipDownload: true },
      });
      const files = Object.keys((result.output as NodejsLambda).files).map(
        normalizePath
      );

      expect(files).toContain('apps/api/index.js');
      expect(files).toContain('apps/api/package.json');
      expect(files).toContain('node_modules/@workspace/shared');
      // NFT preserves the workspace symlink as a FileFsRef. The target files are
      // reached through that link instead of being listed individually.
      expect(files).not.toContain('packages/shared/package.json');
      expect(files).not.toContain('packages/shared/dist/index.js');
    }
  );

  test('uses the nearest package boundary for conditional exports', async () => {
    const filesystem = await prepareFilesystem(
      {
        'package.json': JSON.stringify({ private: true, type: 'commonjs' }),
        'apps/api/package.json': JSON.stringify({ type: 'module' }),
        'apps/api/index.js': `
          import value from 'conditional-package';
          export default (_req, res) => res.end(value);
        `,
        'node_modules/conditional-package/package.json': JSON.stringify({
          name: 'conditional-package',
          version: '1.0.0',
          exports: {
            '.': {
              import: './import.js',
              require: './require.cjs',
            },
          },
        }),
        'node_modules/conditional-package/import.js': `export default 'import';`,
        'node_modules/conditional-package/require.cjs': `module.exports = 'require';`,
      },
      'vercel-node-workspace-boundary'
    );

    const result = await build({
      ...useWorkspace(filesystem, 'apps/api', 'index.js'),
      ...skipInstall,
      entrypoint: 'index.js',
      meta: { skipDownload: true },
    });
    const files = Object.keys((result.output as NodejsLambda).files).map(
      normalizePath
    );

    expect(files).toContain('node_modules/conditional-package/import.js');
    expect(files).not.toContain('node_modules/conditional-package/require.cjs');
  });

  test('prefers a dependency installed nearest to the workspace app', async () => {
    const filesystem = await prepareFilesystem(
      {
        'node_modules/duplicate/package.json': JSON.stringify({
          name: 'duplicate',
          version: '1.0.0',
          main: 'index.js',
        }),
        'node_modules/duplicate/index.js': `module.exports = 'root';`,
        'apps/api/node_modules/duplicate/package.json': JSON.stringify({
          name: 'duplicate',
          version: '2.0.0',
          main: 'index.js',
        }),
        'apps/api/node_modules/duplicate/index.js': `module.exports = 'nested';`,
        'apps/api/index.js': `
          const value = require('duplicate');
          module.exports = (_req, res) => res.end(value);
        `,
      },
      'vercel-node-workspace-nearest-dependency'
    );

    const result = await build({
      ...useWorkspace(filesystem, 'apps/api', 'index.js'),
      ...skipInstall,
      entrypoint: 'index.js',
      meta: { skipDownload: true },
    });
    const files = Object.keys((result.output as NodejsLambda).files).map(
      normalizePath
    );

    expect(files).toContain('apps/api/node_modules/duplicate/index.js');
    expect(files).not.toContain('node_modules/duplicate/index.js');
  });

  test.skipIf(process.platform === 'win32')(
    'preserves an in-repository file symlink and includes its target',
    async () => {
      const filesystem = await prepareFilesystem(
        {
          'apps/api/index.js': `
            const value = require('./linked.js');
            module.exports = (_req, res) => res.end(value);
          `,
          'apps/api/real/value.js': `module.exports = 'linked';`,
        },
        'vercel-node-workspace-file-symlink'
      );
      const workspace = useWorkspace(filesystem, 'apps/api', 'index.js');
      await addFileSymlink(workspace, 'linked.js', 'real/value.js');

      const result = await build({
        ...workspace,
        ...skipInstall,
        entrypoint: 'index.js',
        meta: { skipDownload: true },
      });
      const files = (result.output as NodejsLambda).files;

      expect(files['apps/api/linked.js']).toMatchObject({ type: 'FileFsRef' });
      expect(files['apps/api/real/value.js']).toBeDefined();
    }
  );

  test.skipIf(process.platform === 'win32')(
    'preserves executable mode for traced workspace files',
    async () => {
      const filesystem = await prepareFilesystem(
        {
          'apps/api/index.js': `
          require('../../packages/tool/bin.js');
          module.exports = (_req, res) => res.end('ok');
        `,
          'packages/tool/bin.js': `module.exports = 'tool';`,
        },
        'vercel-node-workspace-mode'
      );
      await fs.chmod(
        join(filesystem.repoRootPath, 'packages/tool/bin.js'),
        0o755
      );

      const result = await build({
        ...useWorkspace(filesystem, 'apps/api', 'index.js'),
        ...skipInstall,
        entrypoint: 'index.js',
        meta: { skipDownload: true },
      });
      const file = (result.output as NodejsLambda).files[
        'packages/tool/bin.js'
      ];

      expect(file).toBeDefined();
      expect(file.mode & 0o777).toBe(0o755);
    }
  );

  test('keeps workspace files outside workPath relative to repoRootPath', async () => {
    const filesystem = await prepareFilesystem(
      {
        'apps/api/index.js': `
          const shared = require('../../packages/shared');
          module.exports = (_req, res) => res.end(shared);
        `,
        'packages/shared/package.json': JSON.stringify({
          name: '@workspace/shared',
          main: 'index.js',
        }),
        'packages/shared/index.js': `module.exports = 'shared';`,
      },
      'vercel-node-workspace-relative'
    );

    const result = await build({
      ...useWorkspace(filesystem, 'apps/api', 'index.js'),
      ...skipInstall,
      entrypoint: 'index.js',
      meta: { skipDownload: true },
    });
    const files = Object.keys((result.output as NodejsLambda).files).map(
      normalizePath
    );

    expect(files).toContain('apps/api/index.js');
    expect(files).toContain('packages/shared/index.js');
    expect(files).toContain('packages/shared/package.json');
  });
});
