import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import {
  FileBlob,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
} from '@vercel/build-utils';
import { generateProjectManifest, diagnostics } from '../src/diagnostics';

const DIAGNOSTICS_PATH = manifestPath('ruby');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-ruby-diag-test-'));
}

function writeGemfileLock(dir: string, content: string): string {
  const lockPath = path.join(dir, 'Gemfile.lock');
  fs.writeFileSync(lockPath, content);
  return lockPath;
}

function readManifest(dir: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, DIAGNOSTICS_PATH), 'utf-8'));
}

// ─── basic metadata ───────────────────────────────────────────────────────────

describe('generateProjectManifest — metadata', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('writes correct version and runtime', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra (~> 3.1)
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const manifest = readManifest(tempDir);
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.runtime).toBe('ruby');
  });

  it('sorts direct deps alphabetically and transitive deps alphabetically after them', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    base64 (0.2.0)
    rack (3.0.8)
    sinatra (3.1.0)

DEPENDENCIES
  sinatra (~> 3.1)
  rack (~> 3.0)
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    const directs = dependencies
      .filter((d: any) => d.type === 'direct')
      .map((d: any) => d.name);
    const transitives = dependencies
      .filter((d: any) => d.type === 'transitive')
      .map((d: any) => d.name);

    expect(directs).toEqual([...directs].sort());
    expect(transitives).toEqual([...transitives].sort());
    // all directs come before all transitives
    const lastDirectIdx = dependencies.findLastIndex(
      (d: any) => d.type === 'direct'
    );
    const firstTransIdx = dependencies.findIndex(
      (d: any) => d.type === 'transitive'
    );
    if (firstTransIdx !== -1) {
      expect(lastDirectIdx).toBeLessThan(firstTransIdx);
    }
  });
});

// ─── direct deps ──────────────────────────────────────────────────────────────

describe('generateProjectManifest — direct deps', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('classifies direct dep with constraint, resolved version, and registry source', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra (~> 3.1)
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies).toEqual([
      {
        name: 'sinatra',
        type: 'direct',
        scopes: ['prod'],
        requested: '~> 3.1',
        resolved: '3.1.0',
        source: 'registry',
        sourceUrl: 'https://rubygems.org',
      },
    ]);
  });

  it('omits requested when dep has no version constraint', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    webrick (1.8.1)

DEPENDENCIES
  webrick
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.name).toBe('webrick');
    expect(dep.type).toBe('direct');
    expect('requested' in dep).toBe(false);
    expect(dep.resolved).toBe('1.8.1');
  });

  it('resolves to empty string when gem missing from specs', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:

DEPENDENCIES
  ghost-gem (~> 1.0)
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.resolved).toBe('');
  });
});

// ─── transitive deps ──────────────────────────────────────────────────────────

describe('generateProjectManifest — transitive deps', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('classifies gems in specs but not in DEPENDENCIES as transitive', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    rack (3.0.8)
    sinatra (3.1.0)
      rack (~> 3.0)

DEPENDENCIES
  sinatra (~> 3.1)
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    const rack = dependencies.find((d: any) => d.name === 'rack');
    expect(rack.type).toBe('transitive');
    expect(rack.resolved).toBe('3.0.8');
    expect(rack.source).toBe('registry');
    expect(rack.sourceUrl).toBe('https://rubygems.org');
  });

  it('direct deps appear before transitives, both alphabetical within group', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    base64 (0.2.0)
    rack (3.0.8)
    rack-protection (3.1.0)
    sinatra (3.1.0)
      rack (~> 3.0)
      rack-protection (= 3.1.0)

DEPENDENCIES
  sinatra (~> 3.1)
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    const directIdx = dependencies.findIndex((d: any) => d.name === 'sinatra');
    const transIdx = dependencies.findIndex((d: any) => d.name === 'rack');
    expect(directIdx).toBeLessThan(transIdx);
  });
});

// ─── git gems ─────────────────────────────────────────────────────────────────

describe('generateProjectManifest — git gems', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('classifies GIT block gem as source: git with remote URL', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GIT
  remote: https://github.com/sinatra/sinatra.git
  revision: abc123def456
  branch: main
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.name).toBe('sinatra');
    expect(dep.source).toBe('git');
    expect(dep.sourceUrl).toBe('https://github.com/sinatra/sinatra.git');
  });

  it('git transitive dep also gets source: git', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GIT
  remote: https://github.com/org/myapp.git
  revision: abc123
  specs:
    myapp (1.0.0)
    myapp-core (1.0.0)

DEPENDENCIES
  myapp
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    const core = dependencies.find((d: any) => d.name === 'myapp-core');
    expect(core.type).toBe('transitive');
    expect(core.source).toBe('git');
  });
});

// ─── PATH gems excluded ───────────────────────────────────────────────────────

describe('generateProjectManifest — PATH gems excluded', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('excludes gems from PATH block', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    rack (3.0.8)

PATH
  remote: .
  specs:
    local-gem (0.1.0)

DEPENDENCIES
  rack
  local-gem
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('rack');
    expect(names).not.toContain('local-gem');
  });

  it('PATH-only dep in DEPENDENCIES is excluded entirely', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:

PATH
  remote: .
  specs:
    local-gem (0.1.0)

DEPENDENCIES
  local-gem
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    expect(dependencies).toHaveLength(0);
  });
});

// ─── multiple GEM blocks ──────────────────────────────────────────────────────

describe('generateProjectManifest — multiple GEM blocks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('parses gems from multiple GEM blocks with separate remotes', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    rack (3.0.8)

GEM
  remote: https://my.registry.example.com/
  specs:
    private-gem (1.2.3)

DEPENDENCIES
  rack
  private-gem
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    const rack = dependencies.find((d: any) => d.name === 'rack');
    expect(rack.sourceUrl).toBe('https://rubygems.org');

    const priv = dependencies.find((d: any) => d.name === 'private-gem');
    expect(priv.sourceUrl).toBe('https://my.registry.example.com');
    expect(priv.resolved).toBe('1.2.3');
  });
});

// ─── exclamation mark (non-default source) in DEPENDENCIES ────────────────────

describe('generateProjectManifest — ! suffix in DEPENDENCIES', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('resolves git gem listed with ! in DEPENDENCIES', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GIT
  remote: https://github.com/sinatra/sinatra.git
  revision: abc123
  specs:
    sinatra (4.0.0)

DEPENDENCIES
  sinatra!
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    const dep = dependencies.find((d: any) => d.name === 'sinatra');
    expect(dep).toBeDefined();
    expect(dep.type).toBe('direct');
    expect(dep.resolved).toBe('4.0.0');
    expect(dep.source).toBe('git');
  });

  it('excludes PATH gem with ! in DEPENDENCIES', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    rack (3.0.8)

PATH
  remote: .
  specs:
    local-gem (0.1.0)

DEPENDENCIES
  rack
  local-gem!
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const names = readManifest(tempDir).dependencies.map((d: any) => d.name);
    expect(names).toContain('rack');
    expect(names).not.toContain('local-gem');
    expect(names).not.toContain('local-gem!');
  });
});

// ─── platform-specific gem variants ──────────────────────────────────────────

describe('generateProjectManifest — platform-specific gem variants', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('uses base version when platform variants follow it in specs', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    nokogiri (1.18.0)
    nokogiri (1.18.0-arm64-darwin)
    nokogiri (1.18.0-x86_64-linux-gnu)

DEPENDENCIES
  nokogiri
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.name).toBe('nokogiri');
    expect(dep.resolved).toBe('1.18.0');
  });

  it('uses base version when platform variant appears before it in specs', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    nokogiri (1.18.0-arm64-darwin)
    nokogiri (1.18.0)

DEPENDENCIES
  nokogiri
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.name).toBe('nokogiri');
    expect(dep.resolved).toBe('1.18.0');
  });
});

// ─── PLUGIN SOURCE section ────────────────────────────────────────────────────

describe('generateProjectManifest — PLUGIN SOURCE', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('includes plugin-sourced gem with source: plugin and sourceUrl', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
PLUGIN SOURCE
  remote: https://plugins.example.com/
  specs:
    my-plugin (1.0.0)

GEM
  remote: https://rubygems.org/
  specs:
    rack (3.0.8)

DEPENDENCIES
  rack
  my-plugin
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const { dependencies } = readManifest(tempDir);
    const plugin = dependencies.find((d: any) => d.name === 'my-plugin');
    expect(plugin).toBeDefined();
    expect(plugin.resolved).toBe('1.0.0');
    expect(plugin.source).toBe('plugin');
    expect(plugin.sourceUrl).toBe('https://plugins.example.com/');
  });
});

// ─── sourceUrl normalization ──────────────────────────────────────────────────

describe('generateProjectManifest — sourceUrl normalization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('strips trailing path and query from registry remote URL', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/gems/?source=mirror
  specs:
    rack (3.0.8)

DEPENDENCIES
  rack
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.sourceUrl).toBe('https://rubygems.org');
  });

  it('preserves full URL for git source (not normalized to origin)', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GIT
  remote: https://github.com/org/repo.git
  revision: abc123
  specs:
    mylib (1.0.0)

DEPENDENCIES
  mylib
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.sourceUrl).toBe('https://github.com/org/repo.git');
  });
});

// ─── cross-source deduplication ───────────────────────────────────────────────

describe('generateProjectManifest — cross-source deduplication', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('prefers registry gem over git gem when both appear', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GIT
  remote: https://github.com/sinatra/sinatra.git
  revision: abc123
  specs:
    sinatra (3.1.0)

GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const dep = readManifest(tempDir).dependencies[0];
    expect(dep.name).toBe('sinatra');
    expect(dep.source).toBe('registry');
    expect(dep.sourceUrl).toBe('https://rubygems.org');
  });
});

// ─── framework and serviceType ───────────────────────────────────────────────

describe('generateProjectManifest — framework and serviceType', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('includes framework when provided', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
      framework: 'sinatra',
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBe('sinatra');
  });

  it('includes serviceType when provided', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
      serviceType: 'web',
    });

    const manifest = readManifest(tempDir);
    expect(manifest.serviceType).toBe('web');
  });

  it('omits framework and serviceType when not provided', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBeUndefined();
    expect(manifest.serviceType).toBeUndefined();
  });

  it('omits framework and serviceType when null', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
      framework: null,
      serviceType: null,
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBeUndefined();
    expect(manifest.serviceType).toBeUndefined();
  });

  it('omits framework from manifest when empty string provided', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
      framework: '',
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBeUndefined();
  });

  it('omits serviceType from manifest when empty string provided', async () => {
    const lockPath = writeGemfileLock(
      tempDir,
      `\
GEM
  remote: https://rubygems.org/
  specs:
    sinatra (3.1.0)

DEPENDENCIES
  sinatra
`
    );

    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: lockPath,
      serviceType: '',
    });

    const manifest = readManifest(tempDir);
    expect(manifest.serviceType).toBeUndefined();
  });
});

// ─── missing lockfile ─────────────────────────────────────────────────────────

describe('generateProjectManifest — missing lockfile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('writes no manifest when gemfileLockPath is undefined', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: undefined,
    });

    expect(fs.existsSync(path.join(tempDir, DIAGNOSTICS_PATH))).toBe(false);
  });

  it('writes no manifest when lockfile does not exist on disk', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      gemfileLockPath: path.join(tempDir, 'Gemfile.lock'),
    });

    expect(fs.existsSync(path.join(tempDir, DIAGNOSTICS_PATH))).toBe(false);
  });

  it('never throws even when given a corrupt lockfile', async () => {
    const lockPath = writeGemfileLock(tempDir, '\x00\x01\x02 not valid');

    await expect(
      generateProjectManifest({ workPath: tempDir, gemfileLockPath: lockPath })
    ).resolves.toBeUndefined();
  });
});

// ─── diagnostics callback ─────────────────────────────────────────────────────

describe('diagnostics callback', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('returns manifest FileBlob when present', async () => {
    const manifestFilePath = path.join(tempDir, DIAGNOSTICS_PATH);
    fs.mkdirSync(path.dirname(manifestFilePath), { recursive: true });
    const content = JSON.stringify({
      version: MANIFEST_VERSION,
      runtime: 'ruby',
    });
    fs.writeFileSync(manifestFilePath, content);

    const files = await diagnostics({ workPath: tempDir } as any);

    expect(files).toHaveProperty([MANIFEST_FILENAME]);
    const blob = files[MANIFEST_FILENAME] as FileBlob;
    expect(blob).toBeInstanceOf(FileBlob);
    expect(JSON.parse(blob.data as string)).toEqual({
      version: MANIFEST_VERSION,
      runtime: 'ruby',
    });
  });

  it('returns empty object when no manifest exists', async () => {
    const files = await diagnostics({ workPath: tempDir } as any);
    expect(files).toEqual({});
  });
});
