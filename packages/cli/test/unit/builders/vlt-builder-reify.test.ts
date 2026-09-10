import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';
import { remove } from 'fs-extra';
import {
  generateBuilderGraphs,
  LocalPreviewPackageInfoClient,
} from '../../../scripts/generate-builder-graph.mjs';
import {
  createVltBuilderImporter,
  type EmbeddedBuilderGraphs,
} from '../../../src/builders/vlt-builder-importer';

const execFileAsync = promisify(execFile);
const require_ = createRequire(__filename);

async function createPackageTarball(
  root: string,
  directory: string,
  manifest: Record<string, unknown>,
  source: string
) {
  const packageRoot = join(root, directory);
  const tarball = join(root, `${directory}.tgz`);
  await mkdir(join(packageRoot, 'package'), { recursive: true });
  await writeFile(
    join(packageRoot, 'package', 'package.json'),
    JSON.stringify(manifest)
  );
  await writeFile(join(packageRoot, 'package', 'index.js'), source);
  await execFileAsync(
    'tar',
    ['-czf', `${directory}.tgz`, '-C', directory, 'package'],
    { cwd: root }
  );
  return tarball;
}

describe('vlt Builder importer', () => {
  it('reifies future URLs from local tarballs and imports the Builder', async () => {
    const root = await getWriteableDirectory();
    const cacheRoot = join(root, 'cache');
    const baseUrl = 'https://preview.example/tarballs';
    const builderUrl = `${baseUrl}/vercel-test-builder.tgz`;
    const buildUtilsUrl = `${baseUrl}/vercel-build-utils.tgz`;
    try {
      const artifacts = new Map();
      for (const [url, directory, manifest, source] of [
        [
          builderUrl,
          'builder',
          {
            name: '@vercel/test-builder',
            version: '1.0.0',
            main: 'index.js',
            peerDependencies: { '@vercel/build-utils': '1.0.0' },
          },
          'module.exports = { build: () => "local-builder" };',
        ],
        [
          buildUtilsUrl,
          'build-utils',
          {
            name: '@vercel/build-utils',
            version: '1.0.0',
            main: 'index.js',
          },
          'module.exports = {};',
        ],
      ] as const) {
        const path = await createPackageTarball(
          root,
          directory,
          manifest,
          source
        );
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
      expect(JSON.stringify(graphs)).not.toContain(root);

      const debug = vi.fn();
      const importBuilders = createVltBuilderImporter({
        graphs: graphs as EmbeddedBuilderGraphs,
        require: require_,
        cacheRoot,
        packageInfoFactory: options =>
          new LocalPreviewPackageInfoClient(options, artifacts),
        debug,
      });
      const builders = await importBuilders(
        new Map([['@vercel/test-builder', '@vercel/test-builder']])
      );
      const loaded = builders.get('@vercel/test-builder');

      expect(loaded?.pkg.version).toBe('1.0.0');
      expect(loaded?.pkgPath).toContain(
        join('node_modules', '@vercel', 'test-builder', 'package.json')
      );
      expect(await loaded?.builder.build({} as never)).toBe('local-builder');
      expect(debug).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Resolved @vercel\/test-builder@1\.0\.0 with vlt from /
        )
      );
    } finally {
      await remove(root);
    }
  });
});
