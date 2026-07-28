import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  FileBlob,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
} from '@vercel/build-utils';
import { generateProjectManifest, diagnostics } from '../src/diagnostics';

const DIAGNOSTICS_PATH = manifestPath('container');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-container-diag-test-'));
}

describe('generateProjectManifest', () => {
  it('writes a manifest with runtime "container" and empty dependencies', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({ workPath });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.runtime).toBe('container');
    expect(manifest.dependencies).toEqual([]);
  });

  it('includes framework when provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({ workPath, framework: 'container' });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.framework).toBe('container');
  });

  it('includes serviceType when provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({ workPath, serviceType: 'web' });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.serviceType).toBe('web');
  });
});

describe('diagnostics callback', () => {
  it('returns empty object when manifest file does not exist', async () => {
    const workPath = makeTempDir();
    const result = await diagnostics({ workPath } as any);
    expect(result).toEqual({});
  });

  it('returns a FileBlob for the manifest with correct content', async () => {
    const workPath = makeTempDir();
    const manifestFile = path.join(workPath, DIAGNOSTICS_PATH);
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    const content = JSON.stringify({
      version: MANIFEST_VERSION,
      runtime: 'container',
      dependencies: [],
    });
    fs.writeFileSync(manifestFile, content);

    const result = await diagnostics({ workPath } as any);
    const blob = result[MANIFEST_FILENAME] as FileBlob;
    expect(blob).toBeInstanceOf(FileBlob);
    expect(JSON.parse(blob.data as string)).toEqual({
      version: MANIFEST_VERSION,
      runtime: 'container',
      dependencies: [],
    });
  });
});
