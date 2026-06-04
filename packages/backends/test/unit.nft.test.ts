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
});
