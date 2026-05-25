import { it, describe, expect } from 'vitest';
import streamToBuffer, {
  streamToBufferChunks,
} from '../src/fs/stream-to-buffer';
import { Readable, PassThrough } from 'stream';

const MB = 1024 * 1024;

describe('streamToBuffer', () => {
  it('resolves with the concatenated buffer for a normal stream', async () => {
    const stream = Readable.from([Buffer.from('hello'), Buffer.from('world')]);
    const result = await streamToBuffer(stream);
    expect(result.toString()).toBe('helloworld');
  });

  it('rejects when Buffer.concat throws (e.g. exceeds max Buffer size)', async () => {
    // When accumulated stream data exceeds buffer.constants.MAX_LENGTH,
    // Buffer.concat throws a RangeError inside the end-of-stream
    // callback. This must become a Promise rejection so callers can
    // catch it — otherwise it escapes as an uncaught exception and
    // crashes the process.
    const originalConcat = Buffer.concat;
    const stream = new PassThrough();

    Buffer.concat = () => {
      throw new RangeError(
        'The value of "size" is out of range. It must be >= 0 && <= 4294967296. Received 5000000000'
      );
    };

    // Two chunks are needed so buffers.length > 1, which triggers the
    // Buffer.concat code path (single-chunk streams return buffers[0] directly)
    stream.write(Buffer.from('chunk1'));
    stream.end(Buffer.from('chunk2'));

    try {
      await expect(streamToBuffer(stream)).rejects.toThrow(RangeError);
    } finally {
      Buffer.concat = originalConcat;
    }
  });
});

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
