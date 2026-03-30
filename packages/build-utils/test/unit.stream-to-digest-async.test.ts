import { it, describe, expect } from 'vitest';
import { Readable } from 'stream';
import {
  streamToDigestAsync,
  sha256,
  md5,
} from '../src/fs/stream-to-digest-async';
import { createHash } from 'crypto';

describe('streamToDigestAsync', () => {
  it('computes sha256, md5, and size for a stream', async () => {
    const content = Buffer.from('hello world');
    const stream = Readable.from([content]);

    const result = await streamToDigestAsync(stream);

    expect(result.sha256).toBe(
      createHash('sha256').update(content).digest('hex')
    );
    expect(result.md5).toBe(createHash('md5').update(content).digest('hex'));
    expect(result.size).toBe(content.length);
  });

  it('handles multi-chunk streams', async () => {
    const chunk1 = Buffer.from('hello ');
    const chunk2 = Buffer.from('world');
    const combined = Buffer.concat([chunk1, chunk2]);
    const stream = Readable.from([chunk1, chunk2]);

    const result = await streamToDigestAsync(stream);

    expect(result.sha256).toBe(
      createHash('sha256').update(combined).digest('hex')
    );
    expect(result.md5).toBe(createHash('md5').update(combined).digest('hex'));
    expect(result.size).toBe(combined.length);
  });

  it('handles empty streams', async () => {
    const stream = Readable.from([]);

    const result = await streamToDigestAsync(stream);

    expect(result.sha256).toBe(
      createHash('sha256').update(Buffer.alloc(0)).digest('hex')
    );
    expect(result.size).toBe(0);
  });

  it('rejects on stream error', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('stream failed'));
      },
    });

    await expect(streamToDigestAsync(stream)).rejects.toThrow('stream failed');
  });
});

describe('sha256', () => {
  it('returns hex sha256 of a buffer', () => {
    const buf = Buffer.from('test');
    expect(sha256(buf)).toBe(createHash('sha256').update(buf).digest('hex'));
  });

  it('returns hex sha256 of a string', () => {
    expect(sha256('test')).toBe(
      createHash('sha256').update('test').digest('hex')
    );
  });
});

describe('md5', () => {
  it('returns hex md5 of a buffer', () => {
    const buf = Buffer.from('test');
    expect(md5(buf)).toBe(createHash('md5').update(buf).digest('hex'));
  });
});
