import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ejectSnapshot } from '../../../native-eject.js';

let snapshot: string;
let target: string;

beforeEach(async () => {
  snapshot = await mkdtemp(join(tmpdir(), 'vercel-eject-snapshot-'));
  target = join(
    await mkdtemp(join(tmpdir(), 'vercel-eject-target-')),
    'vercel'
  );
  await writeFile(
    join(snapshot, 'package.json'),
    '{"name":"vercel","version":"64.1.0"}'
  );
  await writeFile(join(snapshot, 'pkg.js'), 'binary entry');
  await writeFile(join(snapshot, 'native-esbuild.js'), 'binary loader');
  await mkdir(join(snapshot, 'dist', 'builders'), { recursive: true });
  await writeFile(join(snapshot, 'dist', 'vc.js'), 'await import("./x.js");');
  await writeFile(
    join(snapshot, 'dist', 'builders', 'builder-index.json'),
    '{}'
  );
  const esbuildBin = join(snapshot, 'node_modules', '@esbuild', 'linux-x64');
  await mkdir(join(esbuildBin, 'bin'), { recursive: true });
  await writeFile(join(esbuildBin, 'bin', 'esbuild'), '\x7fELF\x02\x01');
  await chmod(join(esbuildBin, 'bin', 'esbuild'), 0o644);
});

afterEach(async () => {
  await rm(snapshot, { recursive: true, force: true });
  await rm(join(target, '..'), { recursive: true, force: true });
});

describe('ejectSnapshot', () => {
  it('copies dist, node_modules and package.json, but not the binary entry', async () => {
    ejectSnapshot(snapshot, target);

    await expect(
      readFile(join(target, 'dist', 'builders', 'builder-index.json'), 'utf8')
    ).resolves.toBe('{}');
    await expect(
      readFile(join(target, 'package.json'), 'utf8')
    ).resolves.toContain('64.1.0');
    await expect(stat(join(target, 'pkg.js'))).rejects.toThrow();
    await expect(stat(join(target, 'native-esbuild.js'))).rejects.toThrow();
  });

  it('restores the vc.js shebang', async () => {
    ejectSnapshot(snapshot, target);

    await expect(readFile(join(target, 'dist', 'vc.js'), 'utf8')).resolves.toBe(
      '#!/usr/bin/env node\nawait import("./x.js");'
    );
  });

  it('restores a shebang line that pkg replaced with an empty line', async () => {
    await writeFile(
      join(snapshot, 'dist', 'vc.js'),
      '\nawait import("./x.js");'
    );

    ejectSnapshot(snapshot, target);

    await expect(readFile(join(target, 'dist', 'vc.js'), 'utf8')).resolves.toBe(
      '#!/usr/bin/env node\nawait import("./x.js");'
    );
  });

  it('keeps an existing vc.js shebang', async () => {
    await writeFile(
      join(snapshot, 'dist', 'vc.js'),
      '#!/usr/bin/env node\nawait import("./x.js");'
    );

    ejectSnapshot(snapshot, target);

    await expect(readFile(join(target, 'dist', 'vc.js'), 'utf8')).resolves.toBe(
      '#!/usr/bin/env node\nawait import("./x.js");'
    );
  });

  // Windows has no POSIX mode bits to check.
  it.skipIf(process.platform === 'win32')(
    'makes binaries and scripts executable even though the snapshot reports 0644',
    async () => {
      const xdgOpen = join(snapshot, 'node_modules', 'open', 'xdg-open');
      await mkdir(join(xdgOpen, '..'), { recursive: true });
      await writeFile(xdgOpen, '#!/bin/sh\n');
      await chmod(xdgOpen, 0o644);

      ejectSnapshot(snapshot, target);

      expect((await stat(join(target, 'dist', 'vc.js'))).mode & 0o777).toBe(
        0o755
      );

      expect(
        (await stat(join(target, 'node_modules', 'open', 'xdg-open'))).mode &
          0o777
      ).toBe(0o755);
      expect((await stat(join(target, 'package.json'))).mode & 0o777).not.toBe(
        0o755
      );

      const esbuild = join(
        target,
        'node_modules',
        '@esbuild',
        'linux-x64',
        'bin',
        'esbuild'
      );
      expect((await stat(esbuild)).mode & 0o777).toBe(0o755);
    }
  );

  it('writes a manifest with the version, platform and file hashes', async () => {
    const manifest = ejectSnapshot(snapshot, target);

    expect(
      JSON.parse(await readFile(join(target, 'eject-manifest.json'), 'utf8'))
    ).toEqual(manifest);
    expect(manifest).toMatchObject({
      version: '64.1.0',
      platform: process.platform,
      arch: process.arch,
    });
    expect(Object.keys(manifest.files).sort()).toEqual([
      'dist/builders/builder-index.json',
      'dist/vc.js',
      'node_modules/@esbuild/linux-x64/bin/esbuild',
      'package.json',
    ]);
    const vc = await readFile(join(target, 'dist', 'vc.js'), 'utf8');
    expect(manifest.files['dist/vc.js']).toBe(
      createHash('sha256').update(vc).digest('hex')
    );
  });

  it('refuses a non-empty target directory', async () => {
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'existing'), '');

    expect(() => ejectSnapshot(snapshot, target)).toThrow(/is not empty/);
  });

  it('accepts an existing empty target directory', async () => {
    await mkdir(target, { recursive: true });

    expect(ejectSnapshot(snapshot, target).version).toBe('64.1.0');
  });
});
