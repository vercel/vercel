import { it, describe, expect } from 'vitest';
import { streamToBufferChunks } from '../src/fs/stream-to-buffer';
import { Readable } from 'stream';

const MB = 1024 * 1024;

describe('streamToBufferChunks', () => {
  it("returns 1 buffer when the total volume doesn't exceed 100mb", async () => {
    const stream = Readable.from(Buffer.from('a'.repeat(10 * MB)));

    const buffers = await streamToBufferChunks(stream);

    expect(buffers.length).toBe(1);
    expect(buffers[0].length).toBe(10 * MB);
  });
  it('returns multiple buffers when when the mbLimit is exceeded', async () => {
    const stream = Readable.from(Buffer.from('a'.repeat(250 * MB)));

    const buffers = await streamToBufferChunks(stream);

    expect(buffers.length).toBe(3);
    expect(buffers[0].length).toBe(100 * MB);
    expect(buffers[1].length).toBe(100 * MB);
    expect(buffers[2].length).toBe(50 * MB);
  });
});
