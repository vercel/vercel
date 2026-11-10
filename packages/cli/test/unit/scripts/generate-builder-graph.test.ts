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
  writeBuilderIndex,
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

  it('uses only artifacts indexed by their exact URL', async () => {
    const url = 'https://preview.example/tarballs/vercel-node.tgz';
    const artifact = {
      name: '@vercel/node',
      path: '/tmp/node.tgz',
      integrity: 'sha512-test',
    };
    const client = new LocalPreviewPackageInfoClient(
      {},
      new Map([[url, artifact]])
    );

    await expect(client.local(`@vercel/node@${url}`)).resolves.toMatchObject({
      artifact,
      finalUrl: url,
    });
    await expect(
      client.local(
        '@vercel/node@https://preview.example/tarballs/other-node.tgz'
      )
    ).resolves.toBeUndefined();
  });

  it('retains integrity for bytes downloaded from the exact registry URL', async () => {
    const root = await getWriteableDirectory();
    const url = registryTarballUrl('@vercel/node', '1.0.0');
    try {
      const path = await createPackageTarball(root, 'vercel-node-1.0.0', {
        name: '@vercel/node',
        version: '1.0.0',
      });
      const bytes = await readFile(path);
      const integrity = `sha512-${createHash('sha512')
        .update(new Uint8Array(bytes))
        .digest('base64')}`;
      const client = new LocalPreviewPackageInfoClient(
        { projectRoot: root },
        new Map([
          [
            url,
            {
              name: '@vercel/node',
              path,
              sourceUrl: url,
              integrity,
            },
          ],
        ])
      );

      await expect(
        client.manifest(`@vercel/node@${url}`)
      ).resolves.toMatchObject({ dist: { tarball: url, integrity } });
    } finally {
      await remove(root);
    }
  });

  it('indexes downloaded preview artifacts by their packed version', async () => {
    const root = await getWriteableDirectory();
    const builderUrl =
      'https://preview.example/tarballs/vercel-test-builder.tgz';
    const buildUtilsUrl =
      'https://preview.example/tarballs/vercel-build-utils.tgz';
    const staticConfigUrl =
      'https://transitive-preview.example/tarballs/vercel-static-config.tgz';
    try {
      const builderDir = join(root, 'test-builder');
      await mkdir(builderDir);
      await writeFile(
        join(builderDir, 'package.json'),
        JSON.stringify({ name: '@vercel/test-builder', version: '0.0.0' })
      );
      await createPackageTarball(
        builderDir,
        'vercel-test-builder-1.0.0-preview',
        {
          name: '@vercel/test-builder',
          version: '1.0.0-preview',
          main: 'index.js',
          dependencies: {
            '@vercel/static-config': staticConfigUrl,
          },
          peerDependencies: {
            '@vercel/build-utils': '2.0.0-preview',
          },
        }
      );
      const responses = new Map<string, Uint8Array>();
      for (const [url, directory, manifest] of [
        [
          buildUtilsUrl,
          'build-utils',
          {
            name: '@vercel/build-utils',
            version: '2.0.0-preview',
            main: 'index.js',
          },
        ],
        [
          staticConfigUrl,
          'static-config',
          {
            name: '@vercel/static-config',
            version: '3.0.0-preview',
            main: 'index.js',
          },
        ],
      ] as const) {
        responses.set(
          url,
          new Uint8Array(
            await readFile(
              await createPackageTarball(root, directory, manifest)
            )
          )
        );
      }
      const fetchMock = vi.fn(async (url: string) => {
        const body = responses.get(url);
        if (!body) throw new Error(`Unexpected fetch: ${url}`);
        return new Response(body);
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        generateBuilderGraphs(
          { '@vercel/test-builder': builderUrl },
          { buildUtilsSpec: buildUtilsUrl, packagesDir: root }
        )
      ).resolves.toMatchObject({
        builders: {
          '@vercel/test-builder': { version: '1.0.0-preview' },
        },
      });
      expect(fetchMock).not.toHaveBeenCalledWith(builderUrl);
      expect(fetchMock).not.toHaveBeenCalledWith(
        registryTarballUrl('@vercel/build-utils', '2.0.0-preview')
      );
      expect(fetchMock).toHaveBeenCalledWith(staticConfigUrl);
    } finally {
      vi.unstubAllGlobals();
      await remove(root);
    }
  });

  it('locks nested exact-version peers of preview workspace packages to their preview URL', async () => {
    const root = await getWriteableDirectory();
    const baseUrl = 'https://preview.example/tarballs';
    const builderUrl = `${baseUrl}/vercel-test-builder.tgz`;
    const buildUtilsUrl = `${baseUrl}/vercel-build-utils.tgz`;
    const helperUrl = `${baseUrl}/vercel-helper.tgz`;
    const leafUrl = `${baseUrl}/vercel-leaf.tgz`;
    const peerDependencies = { '@vercel/build-utils': '2.0.0-preview' };
    try {
      let buildUtilsIntegrity = '';
      for (const [directory, manifest] of [
        [
          'test-builder',
          {
            name: '@vercel/test-builder',
            version: '1.0.0-preview',
            main: 'index.js',
            dependencies: { '@vercel/helper': helperUrl },
            peerDependencies,
          },
        ],
        [
          'build-utils',
          {
            name: '@vercel/build-utils',
            version: '2.0.0-preview',
            main: 'index.js',
          },
        ],
      ] as const) {
        const packageDir = join(root, directory);
        await mkdir(packageDir);
        await writeFile(
          join(packageDir, 'package.json'),
          JSON.stringify({ name: manifest.name, version: '0.0.0' })
        );
        const path = await createPackageTarball(
          packageDir,
          `vercel-${directory}-${manifest.version}`,
          manifest
        );
        if (directory === 'build-utils') {
          buildUtilsIntegrity = `sha512-${createHash('sha512')
            .update(new Uint8Array(await readFile(path)))
            .digest('base64')}`;
        }
      }
      const responses = new Map<string, Uint8Array>();
      for (const [url, directory, manifest] of [
        [
          helperUrl,
          'helper',
          {
            name: '@vercel/helper',
            version: '3.0.0-preview',
            main: 'index.js',
            dependencies: { '@vercel/leaf': leafUrl },
          },
        ],
        [
          leafUrl,
          'leaf',
          {
            name: '@vercel/leaf',
            version: '4.0.0-preview',
            main: 'index.js',
            peerDependencies,
          },
        ],
      ] as const) {
        responses.set(
          url,
          new Uint8Array(
            await readFile(
              await createPackageTarball(root, directory, manifest)
            )
          )
        );
      }
      const fetchMock = vi.fn(async (url: string) => {
        const body = responses.get(url);
        if (!body) throw new Error(`Unexpected fetch: ${url}`);
        return new Response(body);
      });
      vi.stubGlobal('fetch', fetchMock);

      const graphs = await generateBuilderGraphs(
        { '@vercel/test-builder': builderUrl },
        { buildUtilsSpec: buildUtilsUrl, packagesDir: root }
      );
      const { lockfile } = graphs.builders['@vercel/test-builder'];
      const nodes = lockfile.nodes as Record<string, unknown[]>;
      const buildUtilsNodes = Object.entries(nodes).filter(
        ([, node]) => node[1] === '@vercel/build-utils'
      );
      expect(buildUtilsNodes.length).toBeGreaterThan(0);
      for (const [id, node] of buildUtilsNodes) {
        if (id.startsWith('remote')) continue;
        expect(node[2]).toBe(buildUtilsIntegrity);
        expect(node[3]).toBe(buildUtilsUrl);
      }
      expect(JSON.stringify(lockfile)).not.toContain(
        registryTarballUrl('@vercel/build-utils', '2.0.0-preview')
      );
    } finally {
      vi.unstubAllGlobals();
      await remove(root);
    }
  });

  it('does not fall back to an artifact with the same package name', () => {
    const url = registryTarballUrl('path-to-regexp', '8.3.0');
    const artifact = {
      name: 'path-to-regexp',
      path: '/tmp/path-to-regexp-8.3.0.tgz',
      integrity: 'sha512-test',
    };
    const client = new LocalPreviewPackageInfoClient(
      {},
      new Map([[url, artifact]])
    );

    expect(client.artifact('path-to-regexp@6.1.0')).toBeUndefined();
  });

  it('rejects a mismatched exact-version artifact from every client method', async () => {
    const root = await getWriteableDirectory();
    const expectedUrl = registryTarballUrl('path-to-regexp', '6.1.0');
    try {
      const path = await createPackageTarball(root, 'path-to-regexp', {
        name: 'path-to-regexp',
        version: '8.3.0',
        main: 'index.js',
      });
      const client = new LocalPreviewPackageInfoClient(
        { projectRoot: root },
        new Map([
          [
            expectedUrl,
            {
              name: 'path-to-regexp',
              packageName: 'path-to-regexp',
              version: '8.3.0',
              path,
              integrity: 'sha512-test',
            },
          ],
        ])
      );
      const spec = {
        name: 'path-to-regexp',
        bareSpec: '6.1.0',
        conventionalRegistryTarball: expectedUrl,
        toString: () => 'path-to-regexp@6.1.0',
      };

      const expectedError =
        'Resolved path-to-regexp@6.1.0 to path-to-regexp@8.3.0 instead of 6.1.0';
      for (const operation of [
        () => client.local(spec),
        () => client.manifest(spec),
        () => client.resolve(spec),
        () => client.tarball(spec),
        () => client.extract(spec, join(root, 'extract')),
      ]) {
        await expect(operation()).rejects.toThrow(expectedError);
      }
    } finally {
      await remove(root);
    }
  });

  it('waits for other Builder graphs before cleaning up after a failure', async () => {
    const root = await getWriteableDirectory();
    const badUrl = 'https://preview.example/tarballs/vercel-bad-builder.tgz';
    const slowUrl = 'https://preview.example/tarballs/vercel-slow-builder.tgz';
    const buildUtilsUrl =
      'https://preview.example/tarballs/vercel-build-utils.tgz';
    let releaseSlowFetch!: () => void;
    let markSlowFetchStarted!: () => void;
    const slowFetch = new Promise<void>(resolve => {
      releaseSlowFetch = resolve;
    });
    const slowFetchStarted = new Promise<void>(resolve => {
      markSlowFetchStarted = resolve;
    });

    try {
      const slowBuilder = await readFile(
        await createPackageTarball(root, 'slow-builder', {
          name: '@vercel/slow-builder',
          version: '1.0.0',
          main: 'index.js',
        })
      );
      const buildUtils = await readFile(
        await createPackageTarball(root, 'build-utils', {
          name: '@vercel/build-utils',
          version: '1.0.0',
          main: 'index.js',
        })
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url === badUrl) return new Response('not a tarball');
          if (url === slowUrl) {
            markSlowFetchStarted();
            await slowFetch;
            return new Response(new Uint8Array(slowBuilder));
          }
          if (url === buildUtilsUrl) {
            return new Response(new Uint8Array(buildUtils));
          }
          throw new Error(`Unexpected fetch: ${url}`);
        })
      );

      let settled = false;
      const generation = generateBuilderGraphs(
        {
          '@vercel/bad-builder': badUrl,
          '@vercel/slow-builder': slowUrl,
        },
        { buildUtilsSpec: buildUtilsUrl, packagesDir: root }
      );
      void generation.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );

      await slowFetchStarted;
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(settled).toBe(false);

      releaseSlowFetch();
      await expect(generation).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
      releaseSlowFetch();
      await remove(root);
    }
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

  it('writes the Builder index with only each graph hash and version', async () => {
    const root = await getWriteableDirectory();
    const path = join(root, 'dist/builders/builder-index.json');
    const graphs = {
      schemaVersion: 1,
      builders: {
        '@vercel/node': {
          hash: 'a'.repeat(64),
          name: '@vercel/node',
          version: '1.0.0',
          manifest: { dependencies: {} },
          lockfile: { nodes: {} },
        },
      },
    };
    try {
      await writeBuilderIndex(path, graphs);
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
        schemaVersion: 1,
        builders: {
          '@vercel/node': { hash: 'a'.repeat(64), version: '1.0.0' },
        },
      });
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
      const graph = graphs.builders['@vercel/test-builder'];
      expect(graph.manifest.dependencies).toEqual({
        '@vercel/test-builder': '12.0.1-unpublished',
        '@vercel/build-utils': '13.0.1-unpublished',
      });
      const serialized = JSON.stringify(graph.lockfile);
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
      expect(serialized).not.toContain('sha512-');
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

  it('reads local tarballs from paths that require URL escaping', async () => {
    const root = await getWriteableDirectory();
    const packagesDir = join(root, 'RUNNER~1');
    const packageDir = join(packagesDir, 'ruby');
    const url = 'https://preview.example/tarballs/vercel-ruby.tgz';
    try {
      await mkdir(packageDir, { recursive: true });
      await writeFile(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: '@vercel/ruby', version: '0.0.0' })
      );
      await createPackageTarball(packageDir, 'vercel-ruby-1.0.0', {
        name: '@vercel/ruby',
        version: '1.0.0',
      });

      const artifacts = await indexWorkspaceTarballs(
        { '@vercel/ruby': url },
        packagesDir
      );

      expect(artifacts.get(url)?.manifest).toMatchObject({
        name: '@vercel/ruby',
        version: '1.0.0',
      });
    } finally {
      await remove(root);
    }
  });

  it('does not substitute local packages for transitive preview URLs', async () => {
    const root = await getWriteableDirectory();
    const packageDir = join(root, 'ruby');
    const dependencyDir = join(root, 'static-config');
    const dependencyUrl =
      'https://dependency-preview.example/tarballs/vercel-static-config.tgz';
    try {
      await Promise.all([mkdir(packageDir), mkdir(dependencyDir)]);
      await writeFile(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: '@vercel/ruby', version: '0.0.0' })
      );
      const path = await createPackageTarball(packageDir, 'vercel-ruby-1.0.0', {
        name: '@vercel/ruby',
        version: '1.0.0',
        dependencies: { '@vercel/static-config': dependencyUrl },
      });
      await writeFile(
        join(dependencyDir, 'package.json'),
        JSON.stringify({ name: '@vercel/static-config', version: '0.0.0' })
      );
      const dependencyPath = await createPackageTarball(
        dependencyDir,
        'vercel-static-config-2.0.0',
        { name: '@vercel/static-config', version: '2.0.0' }
      );
      const bytes = await readFile(path);
      const url = 'https://preview.example/tarballs/vercel-ruby.tgz';
      const artifacts = await indexWorkspaceTarballs(
        { '@vercel/ruby': url },
        root
      );
      const artifact = artifacts.get(url)!;
      expect(artifact.path).toBe(path);
      expect(artifact.integrity).toBe(
        `sha512-${createHash('sha512').update(new Uint8Array(bytes)).digest('base64')}`
      );
      expect(artifacts.get(registryTarballUrl('@vercel/ruby', '1.0.0'))).toBe(
        artifact
      );
      expect(artifacts.has(dependencyUrl)).toBe(false);
      expect(
        artifacts.get(registryTarballUrl('@vercel/static-config', '2.0.0'))
          ?.path
      ).toBe(dependencyPath);
    } finally {
      await remove(root);
    }
  });
});
