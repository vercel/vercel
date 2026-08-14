import { FileBlob, Span } from '@vercel/build-utils';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nft } from '../src/rolldown/nft';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.map(dir => rm(dir, { recursive: true, force: true }))
  );
  tmpDirs.length = 0;
});

describe('nft', () => {
  it('traces dependencies from virtual output files', async () => {
    const repoRootPath = await mkdtemp(join(tmpdir(), 'backends-nft-'));
    tmpDirs.push(repoRootPath);

    const packagePath = join(repoRootPath, 'node_modules', 'dual-pkg');
    await mkdir(join(packagePath, 'dist', 'cjs'), { recursive: true });
    await writeFile(
      join(packagePath, 'package.json'),
      JSON.stringify({
        name: 'dual-pkg',
        exports: {
          '.': {
            import: './dist/index.js',
            require: './dist/cjs/index.js',
          },
        },
      })
    );
    await writeFile(join(packagePath, 'dist', 'index.js'), 'export default 1;');
    await writeFile(
      join(packagePath, 'dist', 'cjs', 'index.js'),
      'module.exports = 1;'
    );

    const files = {
      'index.js': new FileBlob({
        data: "module.exports = require('dual-pkg');",
      }),
    };

    await nft({
      workPath: repoRootPath,
      repoRootPath,
      localBuildFiles: new Set(),
      files,
      span: new Span({ name: 'test' }),
      ignoreNodeModules: false,
      traceFiles: true,
    });

    expect(files).toHaveProperty('node_modules/dual-pkg/dist/cjs/index.js');
    expect(files).not.toHaveProperty('node_modules/dual-pkg/dist/index.js');
  });

  it('preserves binary files byte-for-byte when ignoreNodeModules is set', async () => {
    const repoRootPath = await mkdtemp(join(tmpdir(), 'backends-nft-bin-'));
    tmpDirs.push(repoRootPath);

    // A native addon-like binary that is not valid UTF-8. Reading this as a
    // UTF-8 string and writing it back corrupts the bytes, which surfaces at
    // runtime as e.g. "ELF file's phentsize not the expected size".
    const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]);
    const binaryBody = Buffer.alloc(256);
    for (let i = 0; i < binaryBody.length; i++) binaryBody[i] = i;
    const nativeAddon = Buffer.concat([elfHeader, binaryBody]);
    const addonRelPath = 'native.node';
    await writeFile(join(repoRootPath, addonRelPath), nativeAddon);

    const entryRelPath = 'entry.js';
    await writeFile(
      join(repoRootPath, entryRelPath),
      `require('./${addonRelPath}');`
    );

    const files = {
      [entryRelPath]: new FileBlob({
        data: `require('./${addonRelPath}');`,
      }),
    };

    await nft({
      workPath: repoRootPath,
      repoRootPath,
      localBuildFiles: new Set([join(repoRootPath, entryRelPath)]),
      files,
      span: new Span({ name: 'test' }),
      ignoreNodeModules: true,
    });

    const traced = files[addonRelPath];
    expect(traced).toBeInstanceOf(FileBlob);
    expect(Buffer.isBuffer((traced as FileBlob).data)).toBe(true);
    expect(
      Buffer.compare((traced as FileBlob).data as Buffer, nativeAddon)
    ).toBe(0);
  });
});
