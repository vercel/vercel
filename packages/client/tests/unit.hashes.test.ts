import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashes } from '../src/utils/hashes';

const sha1 = (buf: Buffer) =>
  createHash('sha1').update(Uint8Array.from(buf)).digest('hex');

describe('hashes()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buffers small files in memory', async () => {
    const content = Buffer.from('hello world');
    const file = join(tmpdir(), `vercel-client-small-${process.pid}.txt`);
    await fs.writeFile(file, content);

    try {
      const map = await hashes([file]);
      const entry = map.get(sha1(content));
      expect(entry?.data).toBeInstanceOf(Buffer);
      expect(entry?.size).toBe(content.length);
    } finally {
      await fs.remove(file);
    }
  });

  it('streams files larger than the buffer limit instead of fs.readFile', async () => {
    const content = Buffer.from('streamed content');
    const file = join(tmpdir(), `vercel-client-large-${process.pid}.txt`);
    await fs.writeFile(file, content);

    // Pretend the file exceeds Node's fs.readFile limit so the streaming
    // branch is taken without writing a multi-GiB fixture. The actual content
    // is small, so the streamed sha1 still matches the real bytes.
    const fakeSize = 2 ** 31; // > MAX_BUFFER_FILE_SIZE (2 ** 31 - 1)
    (
      vi.spyOn(fs, 'lstat') as unknown as { mockResolvedValue: Function }
    ).mockResolvedValue({
      size: fakeSize,
      mode: 0o100644,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    });
    const readFileSpy = vi.spyOn(fs, 'readFile');

    try {
      const map = await hashes([file]);
      const entry = map.get(sha1(content));
      expect(entry?.data).toBeUndefined();
      expect(entry?.size).toBe(fakeSize);
      // The whole point: a too-large file must never be read into a Buffer.
      expect(readFileSpy).not.toHaveBeenCalled();
    } finally {
      await fs.remove(file);
    }
  });
});
