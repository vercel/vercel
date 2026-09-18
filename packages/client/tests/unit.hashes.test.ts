import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashes, normalizeSymlinkTarget } from '../src/utils/hashes';

const sha1 = (buf: Buffer) =>
  createHash('sha1').update(Uint8Array.from(buf)).digest('hex');

// `join()` yields a host-absolute path on both POSIX and Windows, so these
// cases exercise the absolute-target branch on either platform. The separator
// branch is Windows-only by construction (a backslash is a legal filename
// character on POSIX) and cannot be asserted from a POSIX CI runner.
const toPosix = (p: string) => p.split(sep).join('/');

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

describe('normalizeSymlinkTarget()', () => {
  const workPath = join(tmpdir(), 'vercel-client-norm');
  const linkPath = join(workPath, 'nested', 'link');

  it('rewrites an absolute target inside workPath as relative to the link', () => {
    // A Windows junction always records an absolute target; stored verbatim it
    // would point at the build machine's filesystem from inside the lambda.
    const target = join(workPath, 'pkg', 'real');
    expect(normalizeSymlinkTarget(linkPath, target, workPath)).toBe(
      '../pkg/real'
    );
  });

  it('leaves an absolute target outside workPath alone', () => {
    // Not part of the upload, so there is no correct relative form for it.
    const target = join(tmpdir(), 'somewhere-else', 'real');
    expect(normalizeSymlinkTarget(linkPath, target, workPath)).toBe(
      toPosix(target)
    );
  });

  it('leaves an absolute target alone when no workPath is known', () => {
    const target = join(workPath, 'pkg', 'real');
    expect(normalizeSymlinkTarget(linkPath, target)).toBe(toPosix(target));
  });

  it('preserves a relative target', () => {
    expect(normalizeSymlinkTarget(linkPath, '../pkg/real', workPath)).toBe(
      '../pkg/real'
    );
  });
});

describe('hashes() symlinks', () => {
  it('stores an absolute symlink target relative to the link', async () => {
    const workPath = await fs.mkdtemp(join(tmpdir(), 'vercel-client-link-'));
    const real = join(workPath, 'pkg', 'real.txt');
    const link = join(workPath, 'nested', 'link.txt');
    await fs.outputFile(real, 'content');
    await fs.ensureDir(join(workPath, 'nested'));

    try {
      await fs.symlink(real, link);
    } catch (err) {
      // Creating a symlink on Windows needs elevation or Developer Mode.
      await fs.remove(workPath);
      if ((err as NodeJS.ErrnoException).code === 'EPERM') return;
      throw err;
    }

    try {
      const map = await hashes([link], undefined, workPath);
      const stored = [...map.values()][0].data?.toString('utf8');
      expect(stored).toBe('../pkg/real.txt');
    } finally {
      await fs.remove(workPath);
    }
  });
});
