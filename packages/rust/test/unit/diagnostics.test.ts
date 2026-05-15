import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FileBlob, MANIFEST_FILENAME, manifestPath } from '@vercel/build-utils';
import type { CargoMetadataRoot } from '../../src/lib/cargo';
import { generateProjectManifest, diagnostics } from '../../src/diagnostics';

const DIAGNOSTICS_PATH = manifestPath('rust');
const CRATES_IO = 'registry+https://github.com/rust-lang/crates.io-index';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(tmpdir(), 'vc-rust-diag-test-'));
}

function rmTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function readManifest(workPath: string): any {
  return JSON.parse(
    fs.readFileSync(path.join(workPath, DIAGNOSTICS_PATH), 'utf-8')
  );
}

// ── fixture helpers ──────────────────────────────────────────────────────────

type PkgSpec = {
  name: string;
  version: string;
  source?: string | null;
  deps?: string[]; // names of direct deps within this fixture
};

type DirectSpec = PkgSpec & {
  kind?: null | 'dev' | 'build';
  kinds?: Array<null | 'dev' | 'build'>; // multiple dep_kinds entries
  req?: string;
};

function pkgId(p: PkgSpec): string {
  const src = p.source === undefined ? CRATES_IO : p.source;
  return src
    ? `${p.name} ${p.version} (${src})`
    : `${p.name} ${p.version} (path+file:///workspace)`;
}

/**
 * Build a minimal CargoMetadataRoot for testing.
 * `directDeps` are deps of the root package.
 * `otherPkgs` are any other packages in the resolve graph (transitive, workspace members, etc.).
 */
function makeMetadata(opts: {
  root?: { name?: string; version?: string };
  directDeps?: DirectSpec[];
  otherPkgs?: PkgSpec[];
}): CargoMetadataRoot {
  const root = { name: 'myapp', version: '0.1.0', ...opts.root };
  const direct = opts.directDeps ?? [];
  const others = opts.otherPkgs ?? [];

  const rootSpec: PkgSpec = {
    name: root.name,
    version: root.version,
    source: null,
    deps: direct.map(d => d.name),
  };

  const all: PkgSpec[] = [rootSpec, ...direct, ...others];

  const idOf = (name: string): string => {
    const p = all.find(x => x.name === name);
    return p ? pkgId(p) : `${name} 0.0.0 (${CRATES_IO})`;
  };

  const rootId = pkgId({
    name: root.name,
    version: root.version,
    source: null,
  });

  const packages = all.map(p => ({
    name: p.name,
    version: p.version,
    id: pkgId(p),
    source: p.source === undefined ? CRATES_IO : p.source,
    dependencies: (p.deps ?? []).map(depName => {
      const directEntry = direct.find(d => d.name === depName);
      return {
        name: depName,
        source: CRATES_IO,
        req: directEntry?.req ?? '*',
        kind: directEntry?.kind ?? null,
        target: null,
        rename: null,
        optional: false,
        uses_default_features: true,
        features: [],
        path: '',
        registry: null,
      };
    }),
    // unused fields — cast away
    license: '',
    license_file: '',
    description: '',
    targets: [],
    features: {},
    manifest_path: '',
    metadata: {} as any,
    publish: [],
    authors: [],
    categories: [],
    default_run: null,
    rust_version: '',
    keywords: [],
    readme: '',
    repository: '',
    homepage: '',
    documentation: '',
    edition: '2021',
    links: null,
  }));

  // Root package dependencies (used for req lookup)
  packages[0].dependencies = direct.map(d => ({
    name: d.name,
    source: d.source === undefined ? CRATES_IO : (d.source ?? ''),
    req: d.req ?? '*',
    kind: d.kind ?? null,
    target: null,
    rename: null,
    optional: false,
    uses_default_features: true,
    features: [],
    path: '',
    registry: null,
  }));

  const nodes = all.map(p => ({
    id: pkgId(p),
    dependencies: (p.deps ?? []).map(idOf),
    deps: (p.deps ?? []).map(depName => {
      const directEntry = direct.find(d => d.name === depName);
      return {
        name: depName.replace(/-/g, '_'),
        pkg: idOf(depName),
        dep_kinds: (directEntry?.kinds ?? [directEntry?.kind ?? null]).map(
          k => ({ kind: k, target: null })
        ),
      };
    }),
    features: [],
  }));

  return {
    packages,
    workspace_members: [rootId],
    resolve: { nodes, root: rootId },
    target_directory: '/tmp/target',
    version: 1,
    workspace_root: '/tmp',
    metadata: {} as any,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('generateProjectManifest', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmTempDir(tempDir);
  });

  it('writes manifest with correct version and runtime', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({}),
    });

    const manifest = readManifest(tempDir);
    expect(manifest.version).toBe('20260304');
    expect(manifest.runtime).toBe('rust');
    expect(manifest.dependencies).toEqual([]);
  });

  it('classifies crates.io packages as registry with crates.io url', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [{ name: 'actix-web', version: '4.4.0' }],
      }),
    });

    const manifest = readManifest(tempDir);
    const dep = manifest.dependencies.find((d: any) => d.name === 'actix-web');
    expect(dep.source).toBe('registry');
    expect(dep.sourceUrl).toBe('https://crates.io');
  });

  it('classifies git source packages correctly', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [
          {
            name: 'mylib',
            version: '0.2.0',
            source: 'git+https://github.com/org/mylib?rev=abc123',
          },
        ],
      }),
    });

    const manifest = readManifest(tempDir);
    const dep = manifest.dependencies.find((d: any) => d.name === 'mylib');
    expect(dep.source).toBe('git');
    expect(dep.sourceUrl).toBe('https://github.com/org/mylib');
  });

  it('excludes workspace/path crates (null source)', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [{ name: 'actix-web', version: '4.4.0' }],
        otherPkgs: [{ name: 'shared-utils', version: '0.1.0', source: null }],
      }),
    });

    const manifest = readManifest(tempDir);
    const names = manifest.dependencies.map((d: any) => d.name);
    expect(names).not.toContain('shared-utils');
    expect(names).toContain('actix-web');
  });

  it('excludes path dependencies', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [{ name: 'actix-web', version: '4.4.0' }],
        otherPkgs: [
          {
            name: 'local-helper',
            version: '0.1.0',
            source: 'path+file:///workspace/local-helper',
          },
        ],
      }),
    });

    const manifest = readManifest(tempDir);
    const names = manifest.dependencies.map((d: any) => d.name);
    expect(names).not.toContain('local-helper');
  });

  it('excludes the root crate itself', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        root: { name: 'myapp' },
        directDeps: [{ name: 'serde', version: '1.0.197' }],
      }),
    });

    const manifest = readManifest(tempDir);
    const names = manifest.dependencies.map((d: any) => d.name);
    expect(names).not.toContain('myapp');
    expect(names).toContain('serde');
  });

  it('deps under [dependencies] are direct with prod scope', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [
          { name: 'serde', version: '1.0.197' },
          { name: 'actix-web', version: '4.4.0' },
        ],
      }),
    });

    const manifest = readManifest(tempDir);
    const direct = manifest.dependencies.filter(
      (d: any) => d.type === 'direct'
    );
    expect(direct).toHaveLength(2);
    for (const dep of direct) {
      expect(dep.scopes).toEqual(['prod']);
    }
  });

  it('stores the Cargo.toml version requirement as requested for direct deps', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [
          { name: 'serde', version: '1.0.197', req: '^1' },
          { name: 'actix-web', version: '4.4.0', req: '^4' },
        ],
      }),
    });

    const manifest = readManifest(tempDir);
    const serde = manifest.dependencies.find((d: any) => d.name === 'serde');
    expect(serde.requested).toBe('^1');
    const actix = manifest.dependencies.find(
      (d: any) => d.name === 'actix-web'
    );
    expect(actix.requested).toBe('^4');
  });

  it('deps under [dev-dependencies] get scope dev from dep_kinds kind', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [{ name: 'tokio-test', version: '0.4.3', kind: 'dev' }],
      }),
    });

    const manifest = readManifest(tempDir);
    const dep = manifest.dependencies.find((d: any) => d.name === 'tokio-test');
    expect(dep.type).toBe('direct');
    expect(dep.scopes).toEqual(['dev']);
  });

  it('deps under [build-dependencies] get scope build from dep_kinds kind', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [{ name: 'cc', version: '1.0.90', kind: 'build' }],
      }),
    });

    const manifest = readManifest(tempDir);
    const dep = manifest.dependencies.find((d: any) => d.name === 'cc');
    expect(dep.type).toBe('direct');
    expect(dep.scopes).toEqual(['build']);
  });

  it('direct dep in both [dependencies] and [dev-dependencies] gets both scopes', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [
          { name: 'serde', version: '1.0.197', kinds: [null, 'dev'] },
        ],
      }),
    });

    const manifest = readManifest(tempDir);
    const serde = manifest.dependencies.find((d: any) => d.name === 'serde');
    expect(serde.type).toBe('direct');
    expect(serde.scopes).toEqual(['dev', 'prod']);
  });

  it('transitive deps always get prod scope regardless of what pulls them in', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [
          { name: 'web', version: '1.0.0', deps: ['shared'] },
          {
            name: 'tokio-test',
            version: '0.4.3',
            kind: 'dev',
            deps: ['tokio'],
          },
        ],
        otherPkgs: [
          { name: 'shared', version: '0.5.0' },
          { name: 'tokio', version: '1.36.0' },
        ],
      }),
    });

    const manifest = readManifest(tempDir);
    for (const name of ['shared', 'tokio']) {
      const dep = manifest.dependencies.find((d: any) => d.name === name);
      expect(dep.type).toBe('transitive');
      expect(dep.scopes).toEqual(['prod']);
    }
  });

  it('writes framework and serviceType when passed', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({}),
      framework: 'axum',
      serviceType: 'web',
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBe('axum');
    expect(manifest.serviceType).toBe('web');
  });

  it('omits framework and serviceType when not passed', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({}),
    });

    const manifest = readManifest(tempDir);
    expect(manifest.framework).toBeUndefined();
    expect(manifest.serviceType).toBeUndefined();
  });

  it('does not throw on empty metadata', async () => {
    await expect(
      generateProjectManifest({
        workPath: tempDir,
        cargoMetadata: makeMetadata({}),
      })
    ).resolves.toBeUndefined();
  });

  it('direct deps are sorted alphabetically before transitive', async () => {
    await generateProjectManifest({
      workPath: tempDir,
      cargoMetadata: makeMetadata({
        directDeps: [
          { name: 'zlib', version: '1.0.0', deps: ['ztransitive'] },
          { name: 'alpha', version: '1.0.0' },
        ],
        otherPkgs: [{ name: 'ztransitive', version: '0.1.0' }],
      }),
    });

    const manifest = readManifest(tempDir);
    const deps = manifest.dependencies;
    expect(deps[0].name).toBe('alpha');
    expect(deps[0].type).toBe('direct');
    expect(deps[1].name).toBe('zlib');
    expect(deps[1].type).toBe('direct');
    expect(deps[2].name).toBe('ztransitive');
    expect(deps[2].type).toBe('transitive');
  });
});

describe('diagnostics callback', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmTempDir(tempDir);
  });

  it('returns manifest FileBlob when present', async () => {
    const manifestFilePath = path.join(tempDir, DIAGNOSTICS_PATH);
    fs.mkdirSync(path.dirname(manifestFilePath), { recursive: true });
    const content = JSON.stringify({ version: '20260304', runtime: 'rust' });
    fs.writeFileSync(manifestFilePath, content);

    const files = await diagnostics({ workPath: tempDir } as any);

    expect(files).toHaveProperty([MANIFEST_FILENAME]);
    const blob = files[MANIFEST_FILENAME] as FileBlob;
    expect(blob).toBeInstanceOf(FileBlob);
    expect(JSON.parse(blob.data as string)).toEqual({
      version: '20260304',
      runtime: 'rust',
    });
  });

  it('returns empty object when no manifest exists', async () => {
    const files = await diagnostics({ workPath: tempDir } as any);
    expect(files).toEqual({});
  });
});
