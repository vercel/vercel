import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { brotliDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';
import { remove } from 'fs-extra';
import {
  generateBuilderGraphs,
  hashBuilderGraph,
  indexWorkspaceTarballs,
  LocalPreviewPackageInfoClient,
  packUnpublishedWorkspaceArtifacts,
  pnpmCommand,
  pnpmExecOptions,
  registryTarballUrl,
  writeCompressedBuilderGraphs,
} from '../../../scripts/generate-builder-graph.mjs';

const execFileAsync = promisify(execFile);
const decompress = promisify(brotliDecompress);

async function createPackageTarball(
  root: string,
  directory: string,
  manifest: Record<string, unknown>
) {
  const packageRoot = join(root, directory);
  const tarball = join(root, `${directory}.tgz`);
  await mkdir(join(packageRoot, 'package'), { recursive: true });
  await writeFile(
    join(packageRoot, 'package', 'package.json'),
    JSON.stringify(manifest)
  );
  await writeFile(
    join(packageRoot, 'package', 'index.js'),
    'module.exports = {};'
  );
  await execFileAsync(
    'tar',
    ['-czf', `${directory}.tgz`, '-C', directory, 'package'],
    { cwd: root }
  );
  return tarball;
}

describe('embedded vlt Builder graphs', () => {
  it('hashes graph keys using locale-independent code-unit ordering', () => {
    const graph = {
      '/dep': { '@vercel/node': 1, z: 2, A: 3 },
      '@root': { '·peer': true, '/nested': false },
    };
    const canonical = {
      '/dep': { '@vercel/node': 1, A: 3, z: 2 },
      '@root': { '/nested': false, '·peer': true },
    };
    const expected = createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');

    expect(hashBuilderGraph(graph)).toBe(expected);
  });

  it('downloads and caches remote tarballs for local extraction', async () => {
    const artifacts = new Map();
    const url = 'https://preview.example/tarballs/vercel-node.tgz';
    const artifact = {
      name: '@vercel/node',
      path: '/tmp/node.tgz',
      integrity: 'sha512-test',
    };
    const download = vi.fn(async () => artifact);
    const client = new LocalPreviewPackageInfoClient(
      {},
      artifacts,
      new Map([[url, '@vercel/node']]),
      download
    );

    await expect(client.local(`@vercel/node@${url}`)).resolves.toEqual({
      artifact,
      finalUrl: url,
    });
    await expect(client.local(`@vercel/node@${url}`)).resolves.toEqual({
      artifact,
      finalUrl: url,
    });
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('writes Builder graphs as a Brotli-compressed build artifact', async () => {
    const root = await getWriteableDirectory();
    const path = join(root, 'dist/builders/builder-graph.json.br');
    const graphs = { schemaVersion: 1, builders: {} };
    try {
      await writeCompressedBuilderGraphs(path, graphs);
      expect(
        JSON.parse(
          (await decompress(new Uint8Array(await readFile(path)))).toString()
        )
      ).toEqual(graphs);
    } finally {
      await remove(root);
    }
  });

  it('resolves transitive future workspace URLs from local tarballs', async () => {
    const root = await getWriteableDirectory();
    const baseUrl = 'https://preview.example/tarballs';
    const builderUrl = `${baseUrl}/vercel-test-builder.tgz`;
    const buildUtilsUrl = `${baseUrl}/vercel-build-utils.tgz`;
    const transitiveUrl = `${baseUrl}/vercel-transitive.tgz`;
    try {
      const artifacts = new Map();
      for (const [url, directory, manifest] of [
        [
          builderUrl,
          'builder',
          {
            name: '@vercel/test-builder',
            version: '1.0.0-preview-test',
            main: 'index.js',
            peerDependencies: {
              '@vercel/build-utils': '1.0.0-preview-test',
            },
          },
        ],
        [
          buildUtilsUrl,
          'build-utils',
          {
            name: '@vercel/build-utils',
            version: '1.0.0-preview-test',
            main: 'index.js',
            dependencies: { '@vercel/transitive': transitiveUrl },
          },
        ],
        [
          transitiveUrl,
          'transitive',
          {
            name: '@vercel/transitive',
            version: '1.0.0',
            main: 'index.js',
          },
        ],
      ] as const) {
        const path = await createPackageTarball(root, directory, manifest);
        const bytes = await readFile(path);
        artifacts.set(url, {
          name: manifest.name,
          path,
          integrity: `sha512-${createHash('sha512')
            .update(new Uint8Array(bytes))
            .digest('base64')}`,
        });
      }
      const graphs = await generateBuilderGraphs(
        { '@vercel/test-builder': builderUrl },
        { buildUtilsSpec: buildUtilsUrl, artifacts }
      );
      const graph = graphs.builders['@vercel/test-builder'];
      expect(graph.manifest.dependencies).toEqual({
        '@vercel/test-builder': builderUrl,
        '@vercel/build-utils': buildUtilsUrl,
      });
      const serialized = JSON.stringify(graph.lockfile);
      expect(serialized).toContain(builderUrl);
      expect(serialized).toContain(buildUtilsUrl);
      expect(serialized).toContain(transitiveUrl);
      for (const artifact of artifacts.values()) {
        expect(serialized).toContain(artifact.integrity);
      }
      expect(serialized).not.toContain(root);
    } finally {
      await remove(root);
    }
  });

  it('packs unpublished exact workspace versions instead of resolving them from npm', async () => {
    const root = await getWriteableDirectory();
    const builderDir = join(root, 'test-builder');
    const buildUtilsDir = join(root, 'build-utils');
    const helperDir = join(root, 'helper');
    try {
      for (const [directory, manifest] of [
        [
          builderDir,
          {
            name: '@vercel/test-builder',
            version: '12.0.1-unpublished',
            main: 'index.js',
            dependencies: {
              '@vercel/helper': 'workspace:*',
            },
            peerDependencies: {
              '@vercel/build-utils': 'workspace:*',
            },
          },
        ],
        [
          buildUtilsDir,
          {
            name: '@vercel/build-utils',
            version: '13.0.1-unpublished',
            main: 'index.js',
          },
        ],
        [
          helperDir,
          {
            name: '@vercel/helper',
            version: '1.2.3-unpublished',
            main: 'index.js',
          },
        ],
      ] as const) {
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, 'package.json'),
          JSON.stringify(manifest)
        );
        await writeFile(join(directory, 'index.js'), 'module.exports = {};');
      }
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'unpublished-workspace', private: true })
      );
      await writeFile(
        join(root, 'pnpm-workspace.yaml'),
        "packages:\n  - '*'\n"
      );
      await execFileAsync(pnpmCommand, ['install', '--ignore-scripts'], {
        cwd: root,
        ...pnpmExecOptions(),
      });

      const graphs = await generateBuilderGraphs(
        { '@vercel/test-builder': '12.0.1-unpublished' },
        {
          buildUtilsSpec: '13.0.1-unpublished',
          packagesDir: root,
          hasVersion: async () => false,
        }
      );
      const serialized = JSON.stringify(
        graphs.builders['@vercel/test-builder'].lockfile
      );
      expect(serialized).toContain(
        registryTarballUrl('@vercel/test-builder', '12.0.1-unpublished')
      );
      expect(serialized).toContain(
        registryTarballUrl('@vercel/build-utils', '13.0.1-unpublished')
      );
      expect(serialized).toContain(
        registryTarballUrl('@vercel/helper', '1.2.3-unpublished')
      );
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain('workspace:');
    } finally {
      await remove(root);
    }
  });

  it('does not pack workspace versions that already exist on the registry', async () => {
    const root = await getWriteableDirectory();
    const destDir = join(root, 'packed');
    const builderDir = join(root, 'test-builder');
    try {
      await mkdir(destDir, { recursive: true });
      await mkdir(builderDir, { recursive: true });
      await writeFile(
        join(builderDir, 'package.json'),
        JSON.stringify({
          name: '@vercel/test-builder',
          version: '12.0.1',
          main: 'index.js',
        })
      );
      await writeFile(join(builderDir, 'index.js'), 'module.exports = {};');
      const artifacts = await packUnpublishedWorkspaceArtifacts(
        { '@vercel/test-builder': '12.0.1' },
        root,
        destDir,
        async () => true
      );
      expect([...artifacts.keys()]).toEqual([]);
    } finally {
      await remove(root);
    }
  });

  it('indexes local workspace tarballs under future deployment URLs', async () => {
    const root = await getWriteableDirectory();
    const packageDir = join(root, 'ruby');
    const contents = 'local preview tarball';
    const bytes = new TextEncoder().encode(contents);
    try {
      await mkdir(packageDir, { recursive: true });
      await writeFile(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: '@vercel/ruby' })
      );
      await writeFile(join(packageDir, 'vercel-ruby-1.0.0.tgz'), bytes);
      const url = 'https://preview.example/tarballs/vercel-ruby.tgz';
      const artifacts = await indexWorkspaceTarballs(
        { '@vercel/ruby': url },
        root
      );
      expect(await readFile(artifacts.get(url)!.path, 'utf8')).toBe(contents);
      expect(artifacts.get(url)!.integrity).toBe(
        `sha512-${createHash('sha512').update(contents).digest('base64')}`
      );
    } finally {
      await remove(root);
    }
  });
});
