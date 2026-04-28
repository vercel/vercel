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
  parseGoMod,
  diagnostics,
} from '../src/diagnostics';

const DIAGNOSTICS_PATH = manifestPath('go');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-go-diag-test-'));
}

function writeGoMod(dir: string, content: string): string {
  const goModPath = path.join(dir, 'go.mod');
  fs.writeFileSync(goModPath, content);
  return goModPath;
}

describe('parseGoMod', () => {
  it('extracts go version from go directive', () => {
    const { goVersion } = parseGoMod('module example.com/app\n\ngo 1.21\n');
    expect(goVersion).toBe('1.21');
  });

  it('extracts go version with patch', () => {
    const { goVersion } = parseGoMod('module example.com/app\n\ngo 1.21.3\n');
    expect(goVersion).toBe('1.21.3');
  });

  it('returns empty string when no go directive', () => {
    const { goVersion } = parseGoMod('module example.com/app\n');
    expect(goVersion).toBe('');
  });

  it('parses direct deps from require block', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/stretchr/testify v1.8.4
)
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(2);
    expect(modules[0]).toMatchObject({
      name: 'github.com/gin-gonic/gin',
      version: 'v1.9.1',
      indirect: false,
    });
    expect(modules[1]).toMatchObject({
      name: 'github.com/stretchr/testify',
      version: 'v1.8.4',
      indirect: false,
    });
  });

  it('parses indirect deps', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/go-playground/validator/v10 v10.15.5 // indirect
)
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(2);
    expect(modules[0]).toMatchObject({
      name: 'github.com/gin-gonic/gin',
      indirect: false,
    });
    expect(modules[1]).toMatchObject({
      name: 'github.com/go-playground/validator/v10',
      indirect: true,
    });
  });

  it('parses single-line require', () => {
    const content = `module example.com/app

go 1.21

require github.com/pkg/errors v0.9.1
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      name: 'github.com/pkg/errors',
      version: 'v0.9.1',
      indirect: false,
    });
  });

  it('excludes modules replaced with local paths (block form)', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/local/pkg v0.1.0
    github.com/remote/pkg v1.0.0
)

replace github.com/local/pkg => ./local/pkg
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('github.com/remote/pkg');
  });

  it('excludes modules replaced with local paths (replace block form)', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/local/pkg v0.1.0
    github.com/also/local v0.2.0
    github.com/remote/pkg v1.0.0
)

replace (
    github.com/local/pkg v0.1.0 => ./local/pkg
    github.com/also/local => ../sibling
)
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('github.com/remote/pkg');
  });

  it('keeps module when versioned local replace targets a different version', () => {
    const content = `module example.com/app

go 1.21

require example.com/foo v1.5.0

replace example.com/foo v1.2.3 => ./local
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      name: 'example.com/foo',
      version: 'v1.5.0',
    });
  });

  it('excludes module when versioned local replace targets the required version', () => {
    const content = `module example.com/app

go 1.21

require example.com/foo v1.2.3

replace example.com/foo v1.2.3 => ./local
`;
    const { modules } = parseGoMod(content);
    expect(modules).toEqual([]);
  });

  it('versionless local replace excludes regardless of required version', () => {
    const content = `module example.com/app

go 1.21

require example.com/foo v9.9.9

replace example.com/foo => ./local
`;
    const { modules } = parseGoMod(content);
    expect(modules).toEqual([]);
  });

  it('substitutes module-path replaces with the replacement name and version', () => {
    const content = `module example.com/app

go 1.21

require github.com/old/pkg v1.0.0

replace github.com/old/pkg => github.com/new/pkg v2.0.0
`;
    const { modules } = parseGoMod(content);
    expect(modules).toEqual([
      {
        name: 'github.com/new/pkg',
        version: 'v2.0.0',
        indirect: false,
      },
    ]);
  });

  it('preserves indirect status when substituting via replace', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/direct v1.0.0
    github.com/indirect v1.0.0 // indirect
)

replace github.com/indirect => github.com/forked v2.0.0
`;
    const { modules } = parseGoMod(content);
    const forked = modules.find(m => m.name === 'github.com/forked');
    expect(forked).toMatchObject({ version: 'v2.0.0', indirect: true });
  });

  it('substitutes only the matching version for a versioned module replace', () => {
    const content = `module example.com/app

go 1.21

require github.com/foo v1.5.0

replace github.com/foo v1.2.3 => github.com/bar v2.0.0
`;
    const { modules } = parseGoMod(content);
    // require version (v1.5.0) doesn't match replace LHS (v1.2.3), so the
    // replace doesn't apply and the original entry is preserved.
    expect(modules).toEqual([
      { name: 'github.com/foo', version: 'v1.5.0', indirect: false },
    ]);
  });

  it('substitutes version-only replace (same name, new version)', () => {
    const content = `module example.com/app

go 1.21

require github.com/foo v1.0.0

replace github.com/foo v1.0.0 => github.com/foo v1.0.5
`;
    const { modules } = parseGoMod(content);
    expect(modules).toEqual([
      { name: 'github.com/foo', version: 'v1.0.5', indirect: false },
    ]);
  });

  it('prefers specific-version replace over wildcard replace', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/foo v1.0.0
    github.com/foo-also v2.0.0
)

replace github.com/foo => github.com/wildcard v9.9.9
replace github.com/foo v1.0.0 => github.com/specific v1.0.1
`;
    const { modules } = parseGoMod(content);
    const names = modules.map(m => `${m.name}@${m.version}`).sort();
    // foo v1.0.0 → specific (matches version)
    // foo-also v2.0.0 → no rule matches, kept as-is
    expect(names).toEqual([
      'github.com/foo-also@v2.0.0',
      'github.com/specific@v1.0.1',
    ]);
  });

  it('excludes modules replaced with absolute local paths', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/local/pkg v0.1.0
    github.com/remote/pkg v1.0.0
)

replace github.com/local/pkg => /absolute/path
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('github.com/remote/pkg');
  });

  it('excludes modules replaced with bare local paths in block form', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/a v1.0.0
    github.com/b v1.0.0
    github.com/c v1.0.0
)

replace (
    github.com/a => ./local
    github.com/b => /abs/path
    github.com/c v1.0.0 => ../sibling
)
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(0);
  });

  it('handles trailing comments on replace directives', () => {
    const content = `module example.com/app

go 1.21

require github.com/foo v1.0.0

replace github.com/foo => ./local // pinned for debugging
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(0);
  });

  it('handles indirect comment without leading space', () => {
    const content = `module example.com/app

go 1.21

require (
    github.com/foo v1.0.0 //indirect
    github.com/bar v2.0.0// indirect
)
`;
    const { modules } = parseGoMod(content);
    expect(modules).toEqual([
      { name: 'github.com/foo', version: 'v1.0.0', indirect: true },
      { name: 'github.com/bar', version: 'v2.0.0', indirect: true },
    ]);
  });

  it('does not pollute version with trailing comment', () => {
    const content = `module example.com/app

go 1.21

require github.com/foo v1.0.0 // some note
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(1);
    expect(modules[0].version).toBe('v1.0.0');
  });

  it('handles multiple require blocks', () => {
    const content = `module example.com/app

go 1.21

require github.com/pkg/a v1.0.0

require (
    github.com/pkg/b v2.0.0
    github.com/pkg/c v3.0.0 // indirect
)
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(3);
  });

  it('ignores exclude directives', () => {
    const content = `module example.com/app

go 1.21

require github.com/pkg/a v1.0.0

exclude github.com/old/dep v1.0.0

exclude (
    github.com/another/excluded v0.5.0
    github.com/yet/another v2.0.0
)
`;
    const { modules } = parseGoMod(content);
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('github.com/pkg/a');
  });

  it('ignores toolchain directive', () => {
    const content = `module example.com/app

go 1.21
toolchain go1.22.1

require github.com/pkg/a v1.0.0
`;
    const { goVersion, modules } = parseGoMod(content);
    expect(goVersion).toBe('1.21');
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('github.com/pkg/a');
  });

  it('returns empty modules when go.mod has no requires', () => {
    const content = `module example.com/app

go 1.21
`;
    const { goVersion, modules } = parseGoMod(content);
    expect(goVersion).toBe('1.21');
    expect(modules).toEqual([]);
  });

  it('ignores godebug, retract, ignore, and tool directives without false matches', () => {
    const content = `module example.com/mymodule

go 1.24

toolchain go1.24.1

godebug asynctimerchan=0

godebug (
    default=go1.21
    panicnil=1
)

require (
    github.com/keep/me v1.0.0
    golang.org/x/tools v0.20.0 // indirect
)

tool example.com/mymodule/cmd/mytool

tool (
    golang.org/x/tools/cmd/stringer
    github.com/foo/bar/cmd/foo
)

retract v1.0.0 // accidental release

retract (
    [v1.1.0, v1.1.5]
    v1.2.0 // contains retraction only
)

ignore ./node_modules

ignore (
    static
    generated
)
`;
    const { goVersion, modules } = parseGoMod(content);
    expect(goVersion).toBe('1.24');
    expect(modules.map(m => m.name).sort()).toEqual([
      'github.com/keep/me',
      'golang.org/x/tools',
    ]);
  });
});

describe('generateProjectManifest', () => {
  it('skips manifest generation when goModPath is undefined', async () => {
    const workPath = makeTempDir();
    await generateProjectManifest({
      workPath,
      goModPath: undefined,
      goVersion: '',
    });
    expect(fs.existsSync(path.join(workPath, DIAGNOSTICS_PATH))).toBe(false);
  });

  it('writes manifest with direct and transitive deps', async () => {
    const workPath = makeTempDir();
    const content = `module example.com/app

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/go-playground/validator/v10 v10.15.5 // indirect
)
`;
    const goModPath = writeGoMod(workPath, content);
    await generateProjectManifest({ workPath, goModPath, goVersion: '' });

    const manifestFile = path.join(workPath, DIAGNOSTICS_PATH);
    expect(fs.existsSync(manifestFile)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.runtime).toBe('go');
    expect(manifest.runtimeVersion.resolved).toBe('1.21');
    expect(manifest.dependencies).toHaveLength(2);

    const direct = manifest.dependencies.find(
      (d: { name: string }) => d.name === 'github.com/gin-gonic/gin'
    );
    expect(direct.type).toBe('direct');
    expect(direct.scopes).toEqual(['prod']);
    expect(direct.resolved).toBe('v1.9.1');
    expect(direct.source).toBe('registry');
    expect(direct.sourceUrl).toBe('https://proxy.golang.org');

    const transitive = manifest.dependencies.find(
      (d: { name: string }) =>
        d.name === 'github.com/go-playground/validator/v10'
    );
    expect(transitive.type).toBe('transitive');
  });

  it('sorts direct deps before transitive, each alphabetically', async () => {
    const workPath = makeTempDir();
    const content = `module example.com/app

go 1.21

require (
    github.com/zzz/pkg v1.0.0
    github.com/aaa/indirect v0.1.0 // indirect
    github.com/aaa/direct v2.0.0
)
`;
    const goModPath = writeGoMod(workPath, content);
    await generateProjectManifest({ workPath, goModPath, goVersion: '' });

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

  it('uses goVersion fallback when go.mod has no go directive', async () => {
    const workPath = makeTempDir();
    const content = `module example.com/app

require github.com/pkg/errors v0.9.1
`;
    const goModPath = writeGoMod(workPath, content);
    await generateProjectManifest({ workPath, goModPath, goVersion: '1.20' });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.runtimeVersion.resolved).toBe('1.20');
  });

  it('does not throw when go.mod is missing', async () => {
    const workPath = makeTempDir();
    const goModPath = path.join(workPath, 'go.mod');
    await expect(
      generateProjectManifest({ workPath, goModPath, goVersion: '' })
    ).resolves.toBeUndefined();
  });

  it('writes manifest with empty dependencies when go.mod has no requires', async () => {
    const workPath = makeTempDir();
    const goModPath = writeGoMod(
      workPath,
      'module example.com/app\n\ngo 1.21\n'
    );
    await generateProjectManifest({ workPath, goModPath, goVersion: '' });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.runtime).toBe('go');
    expect(manifest.runtimeVersion.resolved).toBe('1.21');
    expect(manifest.dependencies).toEqual([]);
  });

  it('does not include the project module itself as a dependency', async () => {
    const workPath = makeTempDir();
    const content = `module example.com/myapp

go 1.21

require github.com/pkg/errors v0.9.1
`;
    const goModPath = writeGoMod(workPath, content);
    await generateProjectManifest({ workPath, goModPath, goVersion: '' });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
    );
    const names = manifest.dependencies.map((d: { name: string }) => d.name);
    expect(names).not.toContain('example.com/myapp');
    expect(names).toContain('github.com/pkg/errors');
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
