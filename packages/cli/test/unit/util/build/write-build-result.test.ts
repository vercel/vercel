import { join } from 'path';
import { glob, FileBlob } from '@vercel/build-utils';
import { describe, expect, it } from 'vitest';
import { filesWithoutFsRefs } from '../../../../src/util/build/write-build-result';

describe('filesWithoutFsRefs()', () => {
  it('should create `filePathMap` with normalized POSIX paths', async () => {
    const repoRootPath = join(
      __dirname,
      '../../../fixtures/unit/commands/build/monorepo'
    );
    const files = {
      ...(await glob('**', repoRootPath)),
      'blob-file.txt': new FileBlob({ data: 'blob file' }),
    };
    const result = filesWithoutFsRefs(files, repoRootPath);
    expect(Object.keys(result.filePathMap!)).not.contain('blob-file.txt');
    expect(result.filePathMap).toMatchInlineSnapshot(`
          {
            ".vercel/project.json": ".vercel/project.json",
            "apps/nextjs/.gitignore": "apps/nextjs/.gitignore",
            "apps/nextjs/next.config.js": "apps/nextjs/next.config.js",
            "apps/nextjs/package.json": "apps/nextjs/package.json",
            "apps/nextjs/pages/index.jsx": "apps/nextjs/pages/index.jsx",
            "package-lock.json": "package-lock.json",
            "package.json": "package.json",
          }
        `);
  });
});
