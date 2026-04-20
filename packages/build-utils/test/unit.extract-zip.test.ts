import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yazl from 'yazl';
import { extractZip, NowBuildError } from '../src';

async function buildZip(
  entries: Array<{
    name: string;
    content?: string | Buffer;
    mode?: number;
    isSymlink?: boolean;
  }>
): Promise<string> {
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content ?? '');
    const options: yazl.Options = {};
    if (typeof entry.mode === 'number') {
      options.mode = entry.mode;
    }
    if (entry.isSymlink) {
      // Mark as symlink via POSIX mode bits. yazl does not set these by
      // default; we bypass the type by casting to the known field.
      options.mode = (options.mode ?? 0o120755) | 0o120000;
    }
    zip.addBuffer(content, entry.name, options);
  }
  zip.end();

  const dest = join(
    await fs.mkdtemp(join(tmpdir(), 'extract-zip-fixture-')),
    'archive.zip'
  );
  await new Promise<void>((resolve, reject) => {
    const { outputStream } = zip;
    const write = require('fs').createWriteStream(dest);
    outputStream.pipe(write);
    outputStream.on('error', reject);
    write.on('error', reject);
    write.on('finish', () => resolve());
  });
  return dest;
}

describe('extractZip', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(tmpdir(), 'extract-zip-out-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('extracts files and preserves nested directories', async () => {
    const zipPath = await buildZip([
      { name: 'a.txt', content: 'hello' },
      { name: 'sub/b.txt', content: 'world' },
    ]);

    await extractZip(zipPath, tmpDir);

    const a = await fs.readFile(join(tmpDir, 'a.txt'), 'utf8');
    const b = await fs.readFile(join(tmpDir, 'sub', 'b.txt'), 'utf8');
    expect(a).toBe('hello');
    expect(b).toBe('world');
  });

  it('honors the `strip` option to remove a leading directory', async () => {
    const zipPath = await buildZip([
      { name: 'top/a.txt', content: 'inner-a' },
      { name: 'top/sub/b.txt', content: 'inner-b' },
    ]);

    await extractZip(zipPath, tmpDir, { strip: 1 });

    const a = await fs.readFile(join(tmpDir, 'a.txt'), 'utf8');
    const b = await fs.readFile(join(tmpDir, 'sub', 'b.txt'), 'utf8');
    expect(a).toBe('inner-a');
    expect(b).toBe('inner-b');
  });

  it('refuses entries that escape the destination (zip-slip)', async () => {
    // yazl won't let us write `..` paths directly; build with a safe name of
    // identical byte length and patch the resulting archive bytes in place.
    const safeName = 'aaa/bbb.txt';
    const attackName = '../attack.t'; // same byte length as safeName
    expect(attackName.length).toBe(safeName.length);

    const zipPath = await buildZip([{ name: safeName, content: 'bad' }]);
    const original = await fs.readFile(zipPath);
    const patched = Buffer.from(
      original.toString('binary').split(safeName).join(attackName),
      'binary'
    );
    await fs.writeFile(zipPath, patched);

    await expect(extractZip(zipPath, tmpDir)).rejects.toMatchObject({
      code: 'EXTRACT_ZIP_TRAVERSAL',
    });
  });

  it('refuses symlink entries by default', async () => {
    const zipPath = await buildZip([
      { name: 'link.txt', content: '/etc/passwd', isSymlink: true },
    ]);

    await expect(extractZip(zipPath, tmpDir)).rejects.toBeInstanceOf(
      NowBuildError
    );
  });

  it('rejects entry names with NUL bytes', async () => {
    const zipPath = await buildZip([{ name: 'good\0name.txt', content: 'x' }]);

    await expect(extractZip(zipPath, tmpDir)).rejects.toMatchObject({
      code: 'EXTRACT_ZIP_INVALID_ENTRY',
    });
  });
});
