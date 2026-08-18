/*
 * Tests for the `diagnostics` export of @vercel/static-build.
 * All manifests are written to and read from the 'static-build' slot,
 * keeping them separate from the language-builder slots that @vercel/go,
 * @vercel/rust, etc. use. The runtime field inside the manifest reflects
 * the actual runtime of the framework (go for Hugo, rust for Zola, etc.).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import {
  FileBlob,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
} from '@vercel/build-utils';
import { diagnostics } from '../src';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLOT = 'static-build';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-sb-diag-test-'));
}

function writeManifest(workPath: string, data: Record<string, unknown>): void {
  const filePath = path.join(workPath, manifestPath(SLOT));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
}

function readResult(
  files: Record<string, unknown>
): Record<string, unknown> | null {
  const blob = files[MANIFEST_FILENAME] as FileBlob | undefined;
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
    writeManifest(workPath, { ...BASE, runtime: 'go', framework: 'hugo' });
    const files = await diagnostics({ workPath } as any);
    expect(readResult(files)).toMatchObject({
      runtime: 'go',
      framework: 'hugo',
    });
  });

  it('returns nothing when no manifest file exists', async () => {
    const files = await diagnostics({ workPath: makeTempDir() } as any);
    expect(readResult(files)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rust runtime — Zola
// ---------------------------------------------------------------------------

describe('diagnostics – rust runtime', () => {
  it('includes the manifest when framework is zola', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, { ...BASE, runtime: 'rust', framework: 'zola' });
    const files = await diagnostics({ workPath } as any);
    expect(readResult(files)).toMatchObject({
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
    writeManifest(workPath, { ...BASE, runtime: 'ruby', framework: 'jekyll' });
    const files = await diagnostics({ workPath } as any);
    expect(readResult(files)).toMatchObject({
      runtime: 'ruby',
      framework: 'jekyll',
    });
  });

  it('includes the manifest when framework is middleman', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, {
      ...BASE,
      runtime: 'ruby',
      framework: 'middleman',
    });
    const files = await diagnostics({ workPath } as any);
    expect(readResult(files)).toMatchObject({
      runtime: 'ruby',
      framework: 'middleman',
    });
  });
});

// ---------------------------------------------------------------------------
// node runtime — all JS/TS static-build frameworks
// ---------------------------------------------------------------------------

describe('diagnostics – node runtime', () => {
  it('includes the manifest regardless of framework slug', async () => {
    const workPath = makeTempDir();
    writeManifest(workPath, { ...BASE, runtime: 'node', framework: 'gatsby' });
    const files = await diagnostics({ workPath } as any);
    expect(readResult(files)).toMatchObject({
      runtime: 'node',
      framework: 'gatsby',
    });
  });

  it('returns nothing when no manifest file exists', async () => {
    const files = await diagnostics({ workPath: makeTempDir() } as any);
    expect(readResult(files)).toBeNull();
  });
});
