import { join, resolve } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import fs from 'fs-extra';
import tar from 'tar-fs';
import { describe, expect, it } from 'vitest';
import { buildFileTree, prepareFiles } from '../src/utils';
import { createTgzFiles } from '../src/utils/archive';
import { hashes } from '../src/utils/hashes';
import { collectDeploymentFiles } from '../src/collect-deployment-files';

const sensitivePaths = [
  '.git/config',
  '.gitmodules',
  '.hg/hgrc',
  '.svn/entries',
  'CVS/Root',
  'nested/.git/config',
  'node_modules/example/.git/config',
  '.next/server/.git/config',
  '.GIT/config',
];
const safePaths = [
  'safe-handler.js',
  '.env',
  '.env.example',
  '.env.local',
  '.env.production.local',
  'nested/.env.development.local',
  '.next/server/.env.local',
  'node_modules/example/index.js',
  '.next/server/chunks/foo.js',
  '.yarn/cache/foo.zip',
  '.pnp.cjs',
  '.venv/lib/python.py',
  'venv/lib/python.py',
  '__pycache__/foo.pyc',
  'target/release/app',
];

async function removeEmptyTmpRoot(tmpRoot: string) {
  try {
    await fs.rmdir(tmpRoot);
  } catch (error) {
    if (
      !['ENOTEMPTY', 'ENOENT'].includes(
        (error as NodeJS.ErrnoException).code || ''
      )
    ) {
      throw error;
    }
  }
}

describe('prebuilt VCS source-upload defaults', () => {
  it.each([
    undefined,
    '.vercelignore',
    '.nowignore',
  ])('rejects VCS references and preserves env/dependency manifests and archives with ignore file %s', async ignoreFile => {
    const tmpRoot = resolve(__dirname, '../../../tmp');
    await fs.ensureDir(tmpRoot);
    const cwd = await fs.mkdtemp(join(tmpRoot, 'prebuilt-sensitive-'));
    const extracted = `${cwd}-extracted`;
    const outputDir = join(cwd, '.vercel/output');
    const configPath = join(
      outputDir,
      'functions/example.func/.vc-config.json'
    );
    try {
      for (const path of [...sensitivePaths, ...safePaths]) {
        await fs.outputFile(join(cwd, path), `fake fixture: ${path}\n`);
      }
      if (ignoreFile) {
        await fs.outputFile(
          join(cwd, ignoreFile),
          [
            ...sensitivePaths,
            ...sensitivePaths.map(path => `!${path}`),
            'node_modules',
            '.next',
            '.yarn/cache',
            '.pnp*',
            '.venv',
            'venv',
            '__pycache__',
            '/target',
          ].join('\n')
        );
      }
      const config = {
        runtime: 'nodejs22.x',
        handler: 'index.js',
        filePathMap: Object.fromEntries(safePaths.map(path => [path, path])),
      };
      const options = {
        isDirectory: true,
        prebuilt: true,
        vercelOutputDir: outputDir,
      };
      for (const path of [
        ...sensitivePaths,
        './nested/../.git/config',
        'nested/../nested/.git/config',
      ]) {
        await fs.outputJson(configPath, {
          ...config,
          filePathMap: { ...config.filePathMap, vcs: path },
        });
        const original = await fs.readFile(configPath, 'utf8');
        await expect(
          buildFileTree(cwd, options, () => {})
        ).rejects.toMatchObject({
          code: 'PREBUILT_FILEPATHMAP_VCS',
          message:
            'Prebuilt functions reference version-control files that cannot be uploaded. Exclude version-control files from tracing and rebuild the prebuilt output.',
        });
        for (const archive of [undefined, 'tgz'] as const) {
          await expect(
            collectDeploymentFiles(cwd, { ...options, archive }, () => {})
          ).rejects.toMatchObject({ code: 'PREBUILT_FILEPATHMAP_VCS' });
        }
        expect(await fs.readFile(configPath, 'utf8')).toBe(original);
      }
      // Rebuilt output has only valid references, including Next-style env files.
      await fs.outputJson(configPath, {
        ...config,
        filePathMap: { ...config.filePathMap, escaped: '../outside.txt' },
      });

      const { fileList } = await buildFileTree(
        cwd,
        { isDirectory: true, prebuilt: true, vercelOutputDir: outputDir },
        () => {}
      );
      const expected = [configPath, ...safePaths.map(path => join(cwd, path))];
      expect(fileList.sort()).toEqual(expected.sort());

      const files = await hashes(fileList);
      const manifest = prepareFiles(files, { isDirectory: true, path: cwd });
      expect(manifest.map(file => file.file).sort()).toEqual(
        [
          '.vercel/output/functions/example.func/.vc-config.json',
          ...safePaths,
        ].sort()
      );
      for (const file of files.values()) {
        for (const path of sensitivePaths) {
          expect(file.data?.toString()).not.toContain(`fake fixture: ${path}`);
        }
      }

      const archive = await createTgzFiles(cwd, fileList);
      await fs.ensureDir(extracted);
      await pipeline(
        Readable.from([...archive.values()].map(file => file.data!)),
        createGunzip(),
        tar.extract(extracted)
      );
      for (const path of sensitivePaths) {
        expect(await fs.pathExists(join(extracted, path))).toBe(false);
      }
      for (const path of safePaths) {
        expect(await fs.readFile(join(extracted, path), 'utf8')).toBe(
          `fake fixture: ${path}\n`
        );
      }
    } finally {
      await fs.remove(cwd);
      await fs.remove(extracted);
      await removeEmptyTmpRoot(tmpRoot);
    }
  });
});
