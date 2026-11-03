import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, expect, it } from 'vitest';
import { build } from '../../src';

// Repro for vercel/vercel#17774: @vercel/next re-runs a custom
// installCommand that `vc build` already ran before compiling vercel.ts.
// The harness drives the real build() entry point up to (and past) its
// install step. The build then stops with NEXT_NO_VERSION because the
// fixture declares Next.js without installing it; that error is expected
// here and proves the install step was reached.

async function makeFixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'next-install-'));
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'repro',
      version: '1.0.0',
      dependencies: { next: '16.4.3' },
    })
  );
  return dir;
}

async function readMarker(dir: string): Promise<string> {
  try {
    return await readFile(path.join(dir, 'install-marker.txt'), 'utf8');
  } catch {
    return '';
  }
}

async function runBuild(dir: string): Promise<void> {
  try {
    await build({
      workPath: dir,
      entrypoint: 'package.json',
      files: {},
      config: { installCommand: 'echo ran >> install-marker.txt' },
      meta: {},
    } as never);
  } catch (err: unknown) {
    // Expected: install ran (or was skipped), then the builder fails
    // because Next.js itself is not installed in the fixture.
    expect((err as { code?: string }).code).toBe('NEXT_NO_VERSION');
  }
}

afterEach(() => {
  delete process.env.VERCEL_INSTALL_COMPLETED;
  delete process.env.VERCEL_INSTALL_COMPLETED_PATH;
});

it('runs the custom install command when no marker is set (control)', async () => {
  const dir = await makeFixture();
  await runBuild(dir);
  expect(await readMarker(dir)).toContain('ran');
});

it('skips the custom install command when VERCEL_INSTALL_COMPLETED covers this package.json', async () => {
  const dir = await makeFixture();
  process.env.VERCEL_INSTALL_COMPLETED = '1';
  process.env.VERCEL_INSTALL_COMPLETED_PATH = path.join(dir, 'package.json');
  await runBuild(dir);
  expect(await readMarker(dir)).toBe('');
});

it('still runs the custom install command when the marker has no path scope (a pathless marker cannot show this package.json was installed)', async () => {
  const dir = await makeFixture();
  process.env.VERCEL_INSTALL_COMPLETED = '1';
  await runBuild(dir);
  expect(await readMarker(dir)).toContain('ran');
});

it('still runs the custom install command when the marker path is an empty string', async () => {
  const dir = await makeFixture();
  process.env.VERCEL_INSTALL_COMPLETED = '1';
  process.env.VERCEL_INSTALL_COMPLETED_PATH = '';
  await runBuild(dir);
  expect(await readMarker(dir)).toContain('ran');
});

it('still runs the custom install command when the marker covers a different install root (control)', async () => {
  const dir = await makeFixture();
  process.env.VERCEL_INSTALL_COMPLETED = '1';
  process.env.VERCEL_INSTALL_COMPLETED_PATH = path.join(
    tmpdir(),
    'some-other-root',
    'package.json'
  );
  await runBuild(dir);
  expect(await readMarker(dir)).toContain('ran');
});
