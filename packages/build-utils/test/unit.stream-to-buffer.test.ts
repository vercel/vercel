import { it, describe, expect } from 'vitest';
import { streamToBufferChunks } from '../src/fs/stream-to-buffer';
import { Readable } from 'stream';

describe('streamToBufferChunks', () => {
  it("returns 1 buffer when the total volume doesn't exceed 100mb", async () => {
    const byteLengthOfChunk = 10 * (1024 * 1024);

    const stream = Readable.from(
      ['a', 'b', 'c', 'd', 'e', 'f'].map(letter =>
        Buffer.from(letter.repeat(byteLengthOfChunk))
      )
    );

    const buffers = await streamToBufferChunks(stream);

    expect(buffers.length).toBe(1);
    expect(buffers[0].length).toBe(60 * 1024 * 1024);
  });
  it('returns 2 buffers when when the mbLimit is exceeded', async () => {
    const byteLengthOfChunk = 75 * (1024 * 1024);

    const stream = Readable.from(
      ['a', 'b', 'c'].map(letter =>
        Buffer.from(letter.repeat(byteLengthOfChunk))
      )
    );

    const buffers = await streamToBufferChunks(stream);

    expect(buffers.length).toBe(2);
    expect(buffers[0].length).toBe(150 * 1024 * 1024);
    expect(buffers[1].length).toBe(75 * 1024 * 1024);
  });
  // This test captures the potential gotcha to the chunking logic where it's possible for the resulting buffer
  // to be twice the limit we set, but in practice the expectation is that the chunks will be much smaller
  it('when the chunk size is exactly the buffer size, the resulting buffer is twice the limit', async () => {
    const byteLengthOfChunk = 100 * (1024 * 1024);

    const stream = Readable.from(
      ['a', 'b'].map(letter => Buffer.from(letter.repeat(byteLengthOfChunk)))
    );

    const buffers = await streamToBufferChunks(stream);

    expect(buffers.length).toBe(1);
    expect(buffers[0].length).toBe(200 * 1024 * 1024);
  }, 1000);
});
