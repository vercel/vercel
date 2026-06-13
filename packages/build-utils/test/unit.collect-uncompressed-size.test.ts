import { describe, expect, it } from 'vitest';
import { collectUncompressedSize } from '../src/collect-uncompressed-size';
import { FileBlob, FileFsRef } from '../src';
import fs from 'fs/promises';

describe('collectUncompressedSize()', () => {
  it('returns 0 for empty files', async () => {
    const size = await collectUncompressedSize({});
    expect(size).toEqual(0);
  });

  it('sums FileBlob sizes', async () => {
    const size = await collectUncompressedSize({
      'a.js': new FileBlob({ data: Buffer.alloc(100) }),
      'b.js': new FileBlob({ data: Buffer.alloc(200) }),
    });
    expect(size).toEqual(300);
  });

  it('respects ignoreFn', async () => {
    const size = await collectUncompressedSize(
      {
        'a.js': new FileBlob({ data: Buffer.alloc(100) }),
        'node_modules/x.js': new FileBlob({ data: Buffer.alloc(500) }),
      },
      key => key.startsWith('node_modules/')
    );
    expect(size).toEqual(100);
  });

  it('handles string data in FileBlob', async () => {
    const size = await collectUncompressedSize({
      'a.txt': new FileBlob({ data: 'hello world' }),
    });
    expect(size).toEqual(11);
  });

  it('supports FileFsRef', async () => {
    const stats = await fs.lstat(__filename);
    const fileSize = stats.size;

    const size = await collectUncompressedSize({
      'index.js': new FileFsRef({
        mode: 0o644,
        fsPath: __filename, // use self
        contentType: 'some-type',
      }),
    });

    expect(size).toBe(fileSize);
  });

  it('supports mixed FileFsRef and FileBlob', async () => {
    const stats = await fs.lstat(__filename);
    const fileSize = stats.size;

    const size = await collectUncompressedSize({
      'index.js': new FileFsRef({
        mode: 0o644,
        fsPath: __filename, // use self
        contentType: 'some-type',
      }),
      'other.js': new FileBlob({
        data: Buffer.alloc(30 * 1024), // 30KB
      }),
    });

    expect(size).toBe(fileSize + 30 * 1024);
  });
});
