import { describe, expect, it } from 'vitest';
import { collectUncompressedSize } from '../src/collect-uncompressed-size';
import FileBlob from '../src/file-blob';

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
});
