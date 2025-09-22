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
    const input = {
      ...(await glob('**', repoRootPath)),
      'blob-file.txt': new FileBlob({ data: 'blob file' }),
    };
    const { files, filePathMap = {} } = await filesWithoutFsRefs(
      input,
      repoRootPath
    );

    // Only the "blob-file.txt" file should be in the `files` object
    expect(Object.keys(files)).toHaveLength(1);
    expect(files['blob-file.txt']).toEqual(input['blob-file.txt']);

    // The `filePathMap` should have normalized POSIX paths, even on Windows
    expect(Object.keys(filePathMap)).not.contain('blob-file.txt');
    expect(filePathMap['apps/nextjs/.gitignore']).toEqual(
      'apps/nextjs/.gitignore'
    );
    expect(filePathMap['apps/nextjs/next.config.js']).toEqual(
      'apps/nextjs/next.config.js'
    );
    expect(filePathMap['apps/nextjs/package.json']).toEqual(
      'apps/nextjs/package.json'
    );
    expect(filePathMap['apps/nextjs/pages/index.jsx']).toEqual(
      'apps/nextjs/pages/index.jsx'
    );
    expect(filePathMap['package-lock.json']).toEqual('package-lock.json');
    expect(filePathMap['package.json']).toEqual('package.json');
  });

  describe('standalone mode', () => {
    it('should move FileFsRef files to shared when sharedDest is provided', async () => {
      const repoRootPath = join(
        __dirname,
        '../../../fixtures/unit/commands/build/monorepo'
      );
      const sharedDest = '.vercel/output/shared';

      const input = {
        ...(await glob('**', repoRootPath)),
        'blob-file.txt': new FileBlob({ data: 'blob file' }),
      };

      const {
        files,
        filePathMap = {},
        shared = {},
      } = filesWithoutFsRefs(input, repoRootPath, sharedDest, true);

      // Only FileBlob files in files object
      expect(Object.keys(files)).toHaveLength(1);
      expect(files['blob-file.txt']).toEqual(input['blob-file.txt']);

      // FileFsRef files in shared object
      const fileFsRefCount = Object.values(input).filter(
        (f: any) => 'fsPath' in f
      ).length;
      expect(Object.keys(shared)).toHaveLength(fileFsRefCount);
      expect(shared['apps/nextjs/.gitignore']).toBeDefined();
      expect(shared['apps/nextjs/.gitignore'].type).toBe('FileFsRef');
      expect(shared['package.json']).toBeDefined();
      expect(shared['package.json'].type).toBe('FileFsRef');

      // filePathMap has entries for FileFsRef files
      expect(filePathMap['apps/nextjs/.gitignore']).toBeDefined();
      expect(filePathMap['package.json']).toBeDefined();
    });

    it('should fallback to normal mode when sharedDest is not provided', async () => {
      const repoRootPath = join(
        __dirname,
        '../../../fixtures/unit/commands/build/monorepo'
      );

      const input = {
        ...(await glob('**', repoRootPath)),
        'blob-file.txt': new FileBlob({ data: 'blob file' }),
      };

      const {
        files,
        filePathMap = {},
        shared = {},
      } = filesWithoutFsRefs(input, repoRootPath, undefined, true);

      // Only FileBlob files in files object
      expect(Object.keys(files)).toHaveLength(1);
      expect(files['blob-file.txt']).toEqual(input['blob-file.txt']);

      // No files in shared when sharedDest is not provided
      expect(Object.keys(shared)).toHaveLength(0);

      // Normal mode behavior
      expect(filePathMap['apps/nextjs/.gitignore']).toEqual(
        'apps/nextjs/.gitignore'
      );
      expect(filePathMap['package.json']).toEqual('package.json');
    });

    it('should handle mixed file types correctly', async () => {
      const repoRootPath = join(
        __dirname,
        '../../../fixtures/unit/commands/build/monorepo'
      );
      const sharedDest = '.vercel/output/shared';

      const mixedInput = {
        'file1.js': new FileBlob({ data: 'console.log("hello");' }),
        'file2.txt': new FileBlob({ data: 'text content' }),
        'dir/file3.js': new FileBlob({ data: 'module.exports = {};' }),
        ...(await glob('**', repoRootPath)),
      };

      const {
        files,
        filePathMap = {},
        shared = {},
      } = filesWithoutFsRefs(mixedInput, repoRootPath, sharedDest, true);

      // Only FileBlob files in files object
      const fileBlobCount = Object.values(mixedInput).filter(
        (f: any) => !('fsPath' in f)
      ).length;
      expect(Object.keys(files)).toHaveLength(fileBlobCount);
      expect(files['file1.js']).toEqual(mixedInput['file1.js']);
      expect(files['file2.txt']).toEqual(mixedInput['file2.txt']);

      // FileFsRef files in shared object
      const fileFsRefCount = Object.values(mixedInput).filter(
        (f: any) => 'fsPath' in f
      ).length;
      expect(Object.keys(shared)).toHaveLength(fileFsRefCount);
      expect(shared['apps/nextjs/.gitignore']).toBeDefined();
      expect(shared['package.json']).toBeDefined();

      // filePathMap only contains FileFsRef files
      expect(Object.keys(filePathMap)).toHaveLength(fileFsRefCount);
      expect(filePathMap['file1.js']).toBeUndefined();
      expect(filePathMap['file2.txt']).toBeUndefined();
      expect(filePathMap['apps/nextjs/.gitignore']).toBeDefined();
    });
  });
});
