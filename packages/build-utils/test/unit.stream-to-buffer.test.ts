import { it, describe, expect } from 'vitest';
import { streamToBufferChunks } from '../src/fs/stream-to-buffer';
import { Readable } from 'stream';

describe('streamToBufferChunks', () => {
  it("returns 1 buffer when the total volume doesn't exceed 100mb", async () => {
    const tenMbs = 10 * (1024 * 1024);

    const stream = Readable.from(Buffer.from('a'.repeat(tenMbs)));

    const buffers = await streamToBufferChunks(stream);

    expect(buffers.length).toBe(1);
    expect(buffers[0].length).toBe(10 * 1024 * 1024);
  });
  it('returns multiple buffers when when the mbLimit is exceeded', async () => {
    const twoHundredFiftyMBs = 250 * (1024 * 1024);

    const stream = Readable.from(Buffer.from('a'.repeat(twoHundredFiftyMBs)));

    const buffers = await streamToBufferChunks(stream);

    expect(buffers.length).toBe(3);
    expect(buffers[0].length).toBe(100 * 1024 * 1024);
    expect(buffers[1].length).toBe(100 * 1024 * 1024);
    expect(buffers[2].length).toBe(50 * 1024 * 1024);
  });
});
