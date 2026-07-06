import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { promises } from 'fs';
import { tmpdir } from 'os';
import { LocalFileSystemDetector } from '@vercel/fs-detectors';
import type { StaleFrameworkEntry } from '@vercel/frameworks';
import { checkStaleFrameworks } from '../../../../src/util/build/resolve-frameworks';

const { mkdtemp, rm, writeFile } = promises;

function staleEntry(
  overrides: Partial<StaleFrameworkEntry['entry']> & { slug: string }
): StaleFrameworkEntry {
  return {
    reason: 'min-cli-version',
    entry: {
      name: overrides.slug,
      logo: 'https://api-frameworks.vercel.sh/framework-logos/x.svg',
      description: 'x',
      settings: {
        installCommand: { placeholder: 'None' },
        buildCommand: { placeholder: 'None', value: null },
        devCommand: { placeholder: 'None', value: null },
        outputDirectory: { placeholder: 'None' },
      },
      outputDirName: { type: 'static', value: 'public' },
      minCliVersion: '99.0.0',
      ...overrides,
    } as StaleFrameworkEntry['entry'],
  };
}

describe('checkStaleFrameworks', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'vc-stale-frameworks-test-'));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('does nothing when there are no stale entries', async () => {
    const fs = new LocalFileSystemDetector(cwd);
    await expect(checkStaleFrameworks(fs, [])).resolves.toBeUndefined();
  });

  it('does nothing when stale entries do not match the project', async () => {
    await writeFile(join(cwd, 'package.json'), '{}');
    const fs = new LocalFileSystemDetector(cwd);
    await expect(
      checkStaleFrameworks(fs, [
        staleEntry({
          slug: 'shiny',
          detectors: { every: [{ path: 'shiny.config.ts' }] },
        }),
      ])
    ).resolves.toBeUndefined();
  });

  it('ignores stale entries without detectors', async () => {
    const fs = new LocalFileSystemDetector(cwd);
    await expect(
      checkStaleFrameworks(fs, [staleEntry({ slug: 'undetectable' })])
    ).resolves.toBeUndefined();
  });

  it('warns but does not throw for matching soft entries', async () => {
    await writeFile(join(cwd, 'shiny.config.ts'), '');
    const fs = new LocalFileSystemDetector(cwd);
    await expect(
      checkStaleFrameworks(fs, [
        staleEntry({
          slug: 'shiny',
          name: 'Shiny',
          detectors: { every: [{ path: 'shiny.config.ts' }] },
        }),
      ])
    ).resolves.toBeUndefined();
  });

  it('throws for matching failOnStale entries', async () => {
    await writeFile(join(cwd, 'Dockerfile.vercel'), 'FROM node');
    const fs = new LocalFileSystemDetector(cwd);
    await expect(
      checkStaleFrameworks(fs, [
        staleEntry({
          slug: 'container-v2',
          name: 'Container',
          failOnStale: true,
          detectors: { some: [{ path: 'Dockerfile.vercel' }] },
        }),
      ])
    ).rejects.toThrow(
      /Detected "Container" but this version of Vercel CLI cannot build it/
    );
  });

  it('does not throw for failOnStale entries that do not match', async () => {
    await writeFile(join(cwd, 'package.json'), '{}');
    const fs = new LocalFileSystemDetector(cwd);
    await expect(
      checkStaleFrameworks(fs, [
        staleEntry({
          slug: 'container-v2',
          failOnStale: true,
          detectors: { some: [{ path: 'Dockerfile.vercel' }] },
        }),
      ])
    ).resolves.toBeUndefined();
  });
});
