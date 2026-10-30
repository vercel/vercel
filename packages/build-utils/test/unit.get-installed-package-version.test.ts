import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstalledPackageVersion } from '../src/get-installed-package-version';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vc-installed-version-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function install(name: string, version: string) {
  const path = join(root, 'node_modules', name, 'package.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ name, version }));
}

describe('getInstalledPackageVersion', () => {
  it('resolves a package from the project cwd', async () => {
    await install('@vercel/analytics', '1.0.0');
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    expect(await getInstalledPackageVersion('@vercel/analytics')).toBe('1.0.0');
  });

  it('resolves from an explicit project directory', async () => {
    await install('@vercel/speed-insights', '0.0.4');
    expect(
      await getInstalledPackageVersion('@vercel/speed-insights', root)
    ).toBe('0.0.4');
  });

  it('tries each supplied search directory', async () => {
    await install('@vercel/analytics', '1.1.1');
    expect(
      await getInstalledPackageVersion('@vercel/analytics', [
        join(tmpdir(), 'not-installed'),
        root,
      ])
    ).toBe('1.1.1');
  });

  it('reads the installed version rather than a cached JSON module', async () => {
    await install('@vercel/analytics', '1.0.0');
    expect(await getInstalledPackageVersion('@vercel/analytics', root)).toBe(
      '1.0.0'
    );
    await install('@vercel/analytics', '1.1.1');
    expect(await getInstalledPackageVersion('@vercel/analytics', root)).toBe(
      '1.1.1'
    );
  });

  it('returns undefined for missing packages', async () => {
    expect(
      await getInstalledPackageVersion('@vercel/not-installed', root)
    ).toBeUndefined();
  });
});
