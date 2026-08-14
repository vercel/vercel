import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import {
  FileBlob,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
} from '@vercel/build-utils';
import {
  generateProjectManifest,
  applyReplaces,
  diagnostics,
} from '../src/diagnostics';
import type { GoModJson } from '../src/go-helpers';

const DIAGNOSTICS_PATH = manifestPath('go');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-go-diag-test-'));
}

describe('generateProjectManifest', () => {
  it('skips manifest generation when goModJson is undefined', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: null,
      resolvedGoVersion: '1.21.13',
    });
    expect(fs.existsSync(path.join(workPath, DIAGNOSTICS_PATH))).toBe(false);
  });

  it('writes manifest with direct and transitive deps', async () => {
    const workPath = makeTempDir();
    const goModJson: GoModJson = {
      Module: { Path: 'example.com/app' },
      Go: '1.21',
      Require: [
        { Path: 'github.com/gin-gonic/gin', Version: 'v1.9.1' },
        {
          Path: 'github.com/go-playground/validator/v10',
          Version: 'v10.15.5',
          Indirect: true,
        },
      ],
    };
    await generateProjectManifest({
      workPath,
      goModJson,
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.runtime).toBe('go');
    expect(manifest.runtimeVersion.requested).toBe('1.21');
    expect(manifest.runtimeVersion.resolved).toBe('1.21.13');
    expect(manifest.dependencies).toHaveLength(2);

    const direct = manifest.dependencies.find(
      (d: { name: string }) => d.name === 'github.com/gin-gonic/gin'
    );
    expect(direct).toEqual({
      name: 'github.com/gin-gonic/gin',
      type: 'direct',
      scopes: ['prod'],
      requested: 'v1.9.1',
      resolved: 'v1.9.1',
      source: 'registry',
      sourceUrl: 'https://proxy.golang.org',
    });

    const transitive = manifest.dependencies.find(
      (d: { name: string }) =>
        d.name === 'github.com/go-playground/validator/v10'
    );
    expect(transitive).toEqual({
      name: 'github.com/go-playground/validator/v10',
      type: 'transitive',
      scopes: ['prod'],
      requested: 'v10.15.5',
      resolved: 'v10.15.5',
      source: 'registry',
      sourceUrl: 'https://proxy.golang.org',
    });
  });

  it('sorts direct deps before transitive, each alphabetically', async () => {
    const workPath = makeTempDir();
    const goModJson: GoModJson = {
      Module: { Path: 'example.com/app' },
      Go: '1.21',
      Require: [
        { Path: 'github.com/zzz/pkg', Version: 'v1.0.0' },
        { Path: 'github.com/aaa/indirect', Version: 'v0.1.0', Indirect: true },
        { Path: 'github.com/aaa/direct', Version: 'v2.0.0' },
      ],
    };
    await generateProjectManifest({
      workPath,
      goModJson,
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    const names = manifest.dependencies.map((d: { name: string }) => d.name);
    expect(names).toEqual([
      'github.com/aaa/direct',
      'github.com/zzz/pkg',
      'github.com/aaa/indirect',
    ]);
  });

  it('omits requested when goModJson has no Go field', async () => {
    const workPath = makeTempDir();
    const goModJson: GoModJson = {
      Module: { Path: 'example.com/app' },
      Require: [{ Path: 'github.com/pkg/errors', Version: 'v0.9.1' }],
    };
    await generateProjectManifest({
      workPath,
      goModJson,
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.runtimeVersion).not.toHaveProperty('requested');
    expect(manifest.runtimeVersion.resolved).toBe('1.21.13');
  });

  it('writes manifest with empty dependencies when goModJson has no Require', async () => {
    const workPath = makeTempDir();
    const goModJson: GoModJson = {
      Module: { Path: 'example.com/app' },
      Go: '1.21',
    };
    await generateProjectManifest({
      workPath,
      goModJson,
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.runtime).toBe('go');
    expect(manifest.runtimeVersion.requested).toBe('1.21');
    expect(manifest.runtimeVersion.resolved).toBe('1.21.13');
    expect(manifest.dependencies).toEqual([]);
  });

  it('does not include the project module itself as a dependency', async () => {
    const workPath = makeTempDir();
    const goModJson: GoModJson = {
      Module: { Path: 'example.com/myapp' },
      Go: '1.21',
      Require: [
        { Path: 'example.com/myapp', Version: 'v0.0.0' },
        { Path: 'github.com/pkg/errors', Version: 'v0.9.1' },
      ],
    };
    await generateProjectManifest({
      workPath,
      goModJson,
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    const names = manifest.dependencies.map((d: { name: string }) => d.name);
    expect(names).not.toContain('example.com/myapp');
    expect(names).toContain('github.com/pkg/errors');
  });

  it('drops locally-replaced modules from the dependency list', async () => {
    const workPath = makeTempDir();
    const goModJson: GoModJson = {
      Module: { Path: 'example.com/app' },
      Go: '1.21',
      Require: [
        { Path: 'github.com/foo/bar', Version: 'v1.0.0' },
        { Path: 'github.com/keep/me', Version: 'v0.1.0' },
      ],
      Replace: [
        {
          Old: { Path: 'github.com/foo/bar' },
          New: { Path: '../local' },
        },
      ],
    };
    await generateProjectManifest({
      workPath,
      goModJson,
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    const names = manifest.dependencies.map((d: { name: string }) => d.name);
    expect(names).toEqual(['github.com/keep/me']);
  });

  it('substitutes module-path replaces in the dependency list', async () => {
    const workPath = makeTempDir();
    const goModJson: GoModJson = {
      Module: { Path: 'example.com/app' },
      Go: '1.21',
      Require: [{ Path: 'github.com/foo/bar', Version: 'v1.0.0' }],
      Replace: [
        {
          Old: { Path: 'github.com/foo/bar' },
          New: { Path: 'github.com/fork/bar', Version: 'v2.0.0' },
        },
      ],
    };
    await generateProjectManifest({
      workPath,
      goModJson,
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    const names = manifest.dependencies.map((d: { name: string }) => d.name);
    expect(names).toEqual(['github.com/fork/bar']);
    expect(manifest.dependencies[0].resolved).toBe('v2.0.0');
  });

  it('includes framework in manifest when provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: { Module: { Path: 'example.com/app' }, Go: '1.21' },
      resolvedGoVersion: '1.21.13',
      framework: 'go',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.framework).toBe('go');
  });

  it('omits framework from manifest when not provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: { Module: { Path: 'example.com/app' }, Go: '1.21' },
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest).not.toHaveProperty('framework');
  });

  it('omits framework from manifest when empty string provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: { Module: { Path: 'example.com/app' }, Go: '1.21' },
      resolvedGoVersion: '1.21.13',
      framework: '',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest).not.toHaveProperty('framework');
  });

  it('includes serviceType in manifest when provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: { Module: { Path: 'example.com/app' }, Go: '1.21' },
      resolvedGoVersion: '1.21.13',
      serviceType: 'web',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.serviceType).toBe('web');
  });

  it('omits serviceType from manifest when not provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: { Module: { Path: 'example.com/app' }, Go: '1.21' },
      resolvedGoVersion: '1.21.13',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest).not.toHaveProperty('serviceType');
  });

  it('omits serviceType from manifest when empty string provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: { Module: { Path: 'example.com/app' }, Go: '1.21' },
      resolvedGoVersion: '1.21.13',
      serviceType: '',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest).not.toHaveProperty('serviceType');
  });

  it('omits serviceType from manifest when null provided', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModJson: { Module: { Path: 'example.com/app' }, Go: '1.21' },
      resolvedGoVersion: '1.21.13',
      serviceType: null,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest).not.toHaveProperty('serviceType');
  });
});

describe('diagnostics callback', () => {
  it('returns empty object when manifest file does not exist', async () => {
    const workPath = makeTempDir();
    const result = await diagnostics({ workPath } as any);
    expect(result).toEqual({});
  });

  it('returns FileBlob for manifest with correct content', async () => {
    const workPath = makeTempDir();
    const manifestFile = path.join(workPath, DIAGNOSTICS_PATH);
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    const content = JSON.stringify({ version: MANIFEST_VERSION, test: true });
    fs.writeFileSync(manifestFile, content);

    const result = await diagnostics({ workPath } as any);
    const blob = result[MANIFEST_FILENAME] as FileBlob;
    expect(blob).toBeInstanceOf(FileBlob);
    expect(JSON.parse(blob.data as string)).toEqual({
      version: MANIFEST_VERSION,
      test: true,
    });
  });
});

describe('applyReplaces', () => {
  it('passes requires through when no replaces are present', () => {
    const result = applyReplaces({
      Require: [
        { Path: 'github.com/foo/bar', Version: 'v1.0.0' },
        { Path: 'github.com/baz/qux', Version: 'v2.1.0', Indirect: true },
      ],
    });
    expect(result).toEqual([
      { name: 'github.com/foo/bar', version: 'v1.0.0', indirect: false },
      { name: 'github.com/baz/qux', version: 'v2.1.0', indirect: true },
    ]);
  });

  it('drops modules replaced with a local path (New.Version absent)', () => {
    const result = applyReplaces({
      Require: [
        { Path: 'github.com/foo/bar', Version: 'v1.0.0' },
        { Path: 'github.com/keep/me', Version: 'v0.1.0' },
      ],
      Replace: [
        {
          Old: { Path: 'github.com/foo/bar' },
          New: { Path: '../local' },
        },
      ],
    });
    expect(result).toEqual([
      { name: 'github.com/keep/me', version: 'v0.1.0', indirect: false },
    ]);
  });

  it('substitutes module-path replaces with the replacement name and version', () => {
    const result = applyReplaces({
      Require: [{ Path: 'github.com/foo/bar', Version: 'v1.0.0' }],
      Replace: [
        {
          Old: { Path: 'github.com/foo/bar' },
          New: { Path: 'github.com/fork/bar', Version: 'v2.0.0' },
        },
      ],
    });
    expect(result).toEqual([
      { name: 'github.com/fork/bar', version: 'v2.0.0', indirect: false },
    ]);
  });

  it('preserves indirect status when substituting via replace', () => {
    const result = applyReplaces({
      Require: [
        { Path: 'github.com/foo/bar', Version: 'v1.0.0', Indirect: true },
      ],
      Replace: [
        {
          Old: { Path: 'github.com/foo/bar' },
          New: { Path: 'github.com/fork/bar', Version: 'v2.0.0' },
        },
      ],
    });
    expect(result[0].indirect).toBe(true);
  });

  it('applies a versioned replace only when the version matches', () => {
    const result = applyReplaces({
      Require: [{ Path: 'github.com/foo/bar', Version: 'v1.0.0' }],
      Replace: [
        {
          Old: { Path: 'github.com/foo/bar', Version: 'v2.0.0' },
          New: { Path: 'github.com/fork/bar', Version: 'v2.0.1' },
        },
      ],
    });
    expect(result).toEqual([
      { name: 'github.com/foo/bar', version: 'v1.0.0', indirect: false },
    ]);
  });

  it('prefers a version-specific replace over a wildcard replace', () => {
    const result = applyReplaces({
      Require: [{ Path: 'github.com/foo/bar', Version: 'v1.0.0' }],
      Replace: [
        {
          Old: { Path: 'github.com/foo/bar' },
          New: { Path: 'github.com/wildcard/bar', Version: 'v9.0.0' },
        },
        {
          Old: { Path: 'github.com/foo/bar', Version: 'v1.0.0' },
          New: { Path: 'github.com/specific/bar', Version: 'v1.5.0' },
        },
      ],
    });
    expect(result).toEqual([
      { name: 'github.com/specific/bar', version: 'v1.5.0', indirect: false },
    ]);
  });

  it('returns empty when Require is absent', () => {
    expect(applyReplaces({})).toEqual([]);
  });
});
