/*
 * Tests for the `diagnostics` export of @vercel/static-build.
 * Each runtime slot is associated with the framework(s) this builder writes there:
 *   go → hugo  |  rust → zola  |  ruby → jekyll, middleman  |  node → pass-through
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { FileBlob, manifestPath, MANIFEST_VERSION } from '@vercel/build-utils';
import { diagnostics } from '../src';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-sb-diag-test-'));
}

function writeManifest(
  workPath: string,
  runtime: string,
  data: Record<string, unknown>
): void {
  const filePath = path.join(workPath, manifestPath(runtime));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

function readResult(
  files: Record<string, unknown>,
  runtime: string
): Record<string, unknown> | null {
  const blob = files[manifestPath(runtime)] as FileBlob | undefined;
  if (!blob) return null;
  return JSON.parse(blob.data as string);
}

const BASE = { version: MANIFEST_VERSION, dependencies: [] };

// ---------------------------------------------------------------------------
// go runtime — Hugo
// ---------------------------------------------------------------------------

describe('diagnostics – go runtime', () => {
  it('includes the manifest when framework is hugo', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, 'go', {
      ...BASE,
      runtime: 'go',
      framework: 'hugo',
    });

    const files = await diagnostics({ workPath } as any);

    expect(readResult(files, 'go')).toMatchObject({
      runtime: 'go',
      framework: 'hugo',
    });
  });

  it('returns nothing when no manifest file exists', async () => {
    const files = await diagnostics({ workPath: makeTempDir() } as any);
    expect(readResult(files, 'go')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rust runtime — Zola
// ---------------------------------------------------------------------------

describe('diagnostics – rust runtime', () => {
  it('includes the manifest when framework is zola', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, 'rust', {
      ...BASE,
      runtime: 'rust',
      framework: 'zola',
    });

    const files = await diagnostics({ workPath } as any);

    expect(readResult(files, 'rust')).toMatchObject({
      runtime: 'rust',
      framework: 'zola',
    });
  });
});

// ---------------------------------------------------------------------------
// ruby runtime — Jekyll and Middleman
// ---------------------------------------------------------------------------

describe('diagnostics – ruby runtime', () => {
  it('includes the manifest when framework is jekyll', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, 'ruby', {
      ...BASE,
      runtime: 'ruby',
      framework: 'jekyll',
    });

    const files = await diagnostics({ workPath } as any);

    expect(readResult(files, 'ruby')).toMatchObject({ framework: 'jekyll' });
  });

  it('includes the manifest when framework is middleman', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, 'ruby', {
      ...BASE,
      runtime: 'ruby',
      framework: 'middleman',
    });

    const files = await diagnostics({ workPath } as any);

    expect(readResult(files, 'ruby')).toMatchObject({ framework: 'middleman' });
  });
});

// ---------------------------------------------------------------------------
// node runtime — pass-through for all JS/TS static-build frameworks
// ---------------------------------------------------------------------------

describe('diagnostics – node runtime', () => {
  it('includes the manifest regardless of framework slug', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, 'node', {
      ...BASE,
      runtime: 'node',
      framework: 'gatsby',
    });

    const files = await diagnostics({ workPath } as any);

    expect(readResult(files, 'node')).toMatchObject({ framework: 'gatsby' });
  });

  it('returns nothing when no manifest file exists', async () => {
    const files = await diagnostics({ workPath: makeTempDir() } as any);
    expect(readResult(files, 'node')).toBeNull();
  });
});
