import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import type { CargoMetadataRoot } from '../../src/lib/cargo';
import {
  assertStandaloneBinary,
  hasVercelRuntimeDependency,
  resolvedPackageUsesVercelRuntime,
  resolveStandaloneBinary,
  tomlDeclaresVercelRuntime,
} from '../../src/lib/cargo';
import { isApiHandlerBuild } from '../../src/standalone-server';
import {
  excludeCargoTargetDir,
  missingEntrypointError,
} from '../../src/lib/utils';

const tempDirs: string[] = [];

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'vc-rust-standalone-'));
  tempDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('isApiHandlerBuild', () => {
  it.each([
    'api/index.rs',
    'api/nested/handler.rs',
    'api/[id].rs',
  ])('treats %s as an api handler', entrypoint => {
    expect(isApiHandlerBuild(entrypoint)).toBe(true);
  });

  it.each([
    'src/main.rs',
    'src/bin/server.rs',
    'crates/api/src/main.rs',
    'server',
    // Not the `api/` directory.
    'apis/main.rs',
    'src/api/mod.rs',
  ])('treats %s as a whole-app build', entrypoint => {
    expect(isApiHandlerBuild(entrypoint)).toBe(false);
  });
});

describe('tomlDeclaresVercelRuntime', () => {
  it('detects a direct dependency', () => {
    expect(
      tomlDeclaresVercelRuntime({ dependencies: { vercel_runtime: '2' } })
    ).toBe(true);
  });

  it('detects the hyphenated spelling', () => {
    expect(
      tomlDeclaresVercelRuntime({ dependencies: { 'vercel-runtime': '2' } })
    ).toBe(true);
  });

  it('detects a workspace-inherited dependency', () => {
    expect(
      tomlDeclaresVercelRuntime({
        dependencies: { vercel_runtime: { workspace: true } as never },
      })
    ).toBe(true);
  });

  it('detects a renamed dependency', () => {
    expect(
      tomlDeclaresVercelRuntime({
        dependencies: { vc: { package: 'vercel_runtime' } },
      })
    ).toBe(true);
  });

  it('does not treat a workspace dependency table as usage', () => {
    expect(
      tomlDeclaresVercelRuntime({
        workspace: { dependencies: { vercel_runtime: '2' } },
      })
    ).toBe(false);
  });

  it('leaves target-specific dependency selection to Cargo', () => {
    expect(
      tomlDeclaresVercelRuntime({
        target: { 'cfg(unix)': { dependencies: { vercel_runtime: '2' } } },
      })
    ).toBe(false);
  });

  it('leaves optional dependency selection to Cargo', () => {
    expect(
      tomlDeclaresVercelRuntime({
        dependencies: { vercel_runtime: { optional: true } },
      })
    ).toBe(false);
  });

  it('ignores unrelated dependencies', () => {
    expect(
      tomlDeclaresVercelRuntime({
        dependencies: { axum: '0.8', tokio: { package: 'tokio' } },
      })
    ).toBe(false);
  });
});

describe('hasVercelRuntimeDependency', () => {
  it('is false for a plain axum project', async () => {
    const workPath = makeProject({
      'Cargo.toml': '[package]\nname = "app"\n\n[dependencies]\naxum = "0.8"\n',
      'src/main.rs': 'fn main() {}',
    });

    expect(await hasVercelRuntimeDependency(workPath, 'src/main.rs')).toBe(
      false
    );
  });

  it('is true when the crate is a dependency', async () => {
    const workPath = makeProject({
      'Cargo.toml':
        '[package]\nname = "app"\n\n[dependencies]\nvercel_runtime = { version = "2", features = ["axum"] }\n',
      'src/main.rs': 'fn main() {}',
    });

    expect(await hasVercelRuntimeDependency(workPath, 'src/main.rs')).toBe(
      true
    );
  });

  it('does not treat an available workspace dependency as member usage', async () => {
    const workPath = makeProject({
      'Cargo.toml':
        '[workspace]\nmembers = ["api"]\n\n[workspace.dependencies]\nvercel_runtime = "2"\n',
      'api/Cargo.toml': '[package]\nname = "api"\n',
      'api/src/main.rs': 'fn main() {}',
    });

    expect(await hasVercelRuntimeDependency(workPath, 'api/src/main.rs')).toBe(
      false
    );
  });

  it('detects a member that opts into a workspace dependency', async () => {
    const workPath = makeProject({
      'Cargo.toml':
        '[workspace]\nmembers = ["api"]\n\n[workspace.dependencies]\nvercel_runtime = "2"\n',
      'api/Cargo.toml':
        '[package]\nname = "api"\n\n[dependencies]\nvercel_runtime = { workspace = true }\n',
      'api/src/main.rs': 'fn main() {}',
    });

    expect(await hasVercelRuntimeDependency(workPath, 'api/src/main.rs')).toBe(
      true
    );
  });

  it('does not look above workPath', async () => {
    const outer = makeProject({
      'Cargo.toml':
        '[workspace]\n\n[workspace.dependencies]\nvercel_runtime = "2"\n',
      'app/Cargo.toml': '[package]\nname = "app"\n',
      'app/src/main.rs': 'fn main() {}',
    });

    expect(
      await hasVercelRuntimeDependency(path.join(outer, 'app'), 'src/main.rs')
    ).toBe(false);
  });

  it('tolerates a malformed manifest', async () => {
    const workPath = makeProject({
      'Cargo.toml': 'this is not = valid = toml',
      'src/main.rs': 'fn main() {}',
    });

    expect(await hasVercelRuntimeDependency(workPath, 'src/main.rs')).toBe(
      false
    );
  });

  // A bare bin name (or a sentinel path that doesn't exist) can't be
  // attributed to a workspace member without Cargo. Do not let an unrelated
  // member choose the mode; the resolved-graph check handles the selected bin.
  describe('entrypoints that are not files', () => {
    it('is not poisoned by another workspace member', async () => {
      const workPath = makeProject({
        'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
        'crates/api/Cargo.toml':
          '[package]\nname = "api"\n\n[dependencies]\nvercel_runtime = "2"\n',
        'crates/api/src/main.rs': 'fn main() {}',
      });

      expect(await hasVercelRuntimeDependency(workPath, 'api')).toBe(false);
      expect(await hasVercelRuntimeDependency(workPath, 'src/main.rs')).toBe(
        false
      );
    });

    it('stays standalone when no manifest declares the crate', async () => {
      const workPath = makeProject({
        'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
        'crates/server/Cargo.toml':
          '[package]\nname = "server"\n\n[dependencies]\naxum = "0.8"\n',
        'crates/server/src/main.rs': 'fn main() {}',
      });

      expect(await hasVercelRuntimeDependency(workPath, 'server')).toBe(false);
    });

    it('ignores manifests under build output and dependency trees', async () => {
      const workPath = makeProject({
        'Cargo.toml': '[package]\nname = "app"\n',
        'src/main.rs': 'fn main() {}',
        'target/package/foo/Cargo.toml':
          '[package]\nname = "foo"\n\n[dependencies]\nvercel_runtime = "2"\n',
        'node_modules/pkg/Cargo.toml':
          '[package]\nname = "pkg"\n\n[dependencies]\nvercel_runtime = "2"\n',
        '.cargo-vendor/dep/Cargo.toml':
          '[package]\nname = "dep"\n\n[dependencies]\nvercel_runtime = "2"\n',
      });

      expect(await hasVercelRuntimeDependency(workPath, 'app')).toBe(false);
    });
  });
});

describe('fixtures', () => {
  const fixtures = path.join(__dirname, '..', 'fixtures');

  it.each([
    '01-standalone-std',
    '02-standalone-axum',
    '03-standalone-actix',
    '07-server-rewrite',
  ])('resolves the %s fixture to standalone mode', async fixture => {
    const workPath = path.join(fixtures, fixture);
    expect(await hasVercelRuntimeDependency(workPath, 'src/main.rs')).toBe(
      false
    );
  });

  it.each([
    ['04-crate-whole-app', 'src/main.rs'],
    ['05-crate-api-handler', 'api/axum.rs'],
    ['06-crate-api-plain', 'api/hello.rs'],
  ])('keeps the %s fixture on the vercel_runtime crate path', async (fixture, entrypoint) => {
    const workPath = path.join(fixtures, fixture);
    expect(await hasVercelRuntimeDependency(workPath, entrypoint)).toBe(true);
  });
});

interface FakeDependency {
  name: string;
  packageName?: string;
  kind?: null | 'dev' | 'build';
  resolved?: boolean;
}

interface FakePackage {
  name: string;
  id: string;
  default_run?: string | null;
  manifest_path?: string;
  bins?: Array<{ name: string; src_path: string }>;
  dependencies?: FakeDependency[];
}

function makeMetadata(
  packages: FakePackage[],
  options: {
    rootId?: string | null;
    defaultMembers?: string[];
    workspaceRoot?: string;
  } = {}
): CargoMetadataRoot {
  const { rootId = null, defaultMembers, workspaceRoot = '/work' } = options;

  const workspacePackages = packages.map(pkg => ({
    name: pkg.name,
    id: pkg.id,
    default_run: pkg.default_run ?? null,
    manifest_path: pkg.manifest_path ?? `/work/${pkg.name}/Cargo.toml`,
    dependencies: (pkg.dependencies ?? []).map(dep => ({
      kind: dep.kind ?? null,
      name: dep.packageName ?? dep.name,
    })),
    targets: (pkg.bins ?? []).map(bin => ({
      kind: ['bin'],
      crate_types: ['bin'],
      name: bin.name,
      src_path: bin.src_path,
    })),
  }));
  const externalPackages = Array.from(
    new Map(
      packages.flatMap(pkg =>
        (pkg.dependencies ?? []).map(dep => {
          const name = dep.packageName ?? dep.name;
          return [
            name,
            {
              name,
              id: `${name} 1.0.0`,
              manifest_path: `/registry/${name}/Cargo.toml`,
              dependencies: [],
              targets: [],
            },
          ] as const;
        })
      )
    ).values()
  );
  const nodes = packages.map(pkg => ({
    id: pkg.id,
    dependencies: [],
    deps: (pkg.dependencies ?? [])
      .filter(dep => dep.resolved !== false)
      .map(dep => {
        const packageName = dep.packageName ?? dep.name;
        return {
          name: dep.name,
          pkg: `${packageName} 1.0.0`,
          dep_kinds: [{ kind: dep.kind ?? null, target: null }],
        };
      }),
    features: [],
  }));

  return {
    packages: [...workspacePackages, ...externalPackages] as never,
    workspace_members: packages.map(pkg => pkg.id),
    ...(defaultMembers ? { workspace_default_members: defaultMembers } : {}),
    resolve: { nodes, root: rootId },
    workspace_root: workspaceRoot,
    target_directory: '/work/target',
  } as unknown as CargoMetadataRoot;
}

describe('resolveStandaloneBinary', () => {
  const singlePackage = makeMetadata(
    [
      {
        name: 'my-app',
        id: 'my-app 0.1.0',
        manifest_path: '/work/Cargo.toml',
        bins: [{ name: 'my-app', src_path: '/work/src/main.rs' }],
      },
    ],
    { rootId: 'my-app 0.1.0' }
  );

  it('uses the package name when there is no [[bin]]', () => {
    const binary = resolveStandaloneBinary(
      singlePackage,
      'src/main.rs',
      '/work'
    );
    expect(binary).toMatchObject({ name: 'my-app', packageName: 'my-app' });
  });

  it('resolves the single binary even when the entrypoint is a sentinel', () => {
    expect(
      resolveStandaloneBinary(singlePackage, 'src/main.rs', '/work').name
    ).toBe('my-app');
    expect(
      resolveStandaloneBinary(singlePackage, 'does-not-exist.rs', '/work').name
    ).toBe('my-app');
    expect(
      resolveStandaloneBinary(singlePackage, undefined, '/work').name
    ).toBe('my-app');
  });

  it('errors when an existing path is not a binary target', () => {
    const workPath = makeProject({
      'Cargo.toml': '[package]\nname = "app"\n',
      'src/main.rs': 'fn main() {}',
      'src/not-a-bin.rs': 'pub fn helper() {}',
    });
    const metadata = makeMetadata(
      [
        {
          name: 'app',
          id: 'app 0.1.0',
          manifest_path: path.join(workPath, 'Cargo.toml'),
          bins: [
            {
              name: 'app',
              src_path: path.join(workPath, 'src/main.rs'),
            },
          ],
        },
      ],
      { rootId: 'app 0.1.0', workspaceRoot: workPath }
    );

    expect(() =>
      resolveStandaloneBinary(metadata, 'src/not-a-bin.rs', workPath)
    ).toThrow(/exists but is not a Cargo binary target/);
  });

  it('errors when an explicit binary name does not exist', () => {
    expect(() =>
      resolveStandaloneBinary(singlePackage, 'missing', '/work')
    ).toThrow(/No Cargo binary target named `missing`/);
  });

  const multiBin = makeMetadata(
    [
      {
        name: 'app',
        id: 'app 0.1.0',
        manifest_path: '/work/Cargo.toml',
        bins: [
          { name: 'worker', src_path: '/work/src/bin/worker.rs' },
          { name: 'server', src_path: '/work/src/bin/server.rs' },
        ],
      },
    ],
    { rootId: 'app 0.1.0' }
  );

  it('selects a binary by source path', () => {
    expect(
      resolveStandaloneBinary(multiBin, 'src/bin/server.rs', '/work').name
    ).toBe('server');
  });

  it('selects a binary by cargo bin name', () => {
    expect(resolveStandaloneBinary(multiBin, 'server', '/work').name).toBe(
      'server'
    );
  });

  it('falls back to default-run', () => {
    const metadata = makeMetadata(
      [
        {
          name: 'app',
          id: 'app 0.1.0',
          manifest_path: '/work/Cargo.toml',
          default_run: 'server',
          bins: [
            { name: 'worker', src_path: '/work/src/bin/worker.rs' },
            { name: 'server', src_path: '/work/src/bin/server.rs' },
          ],
        },
      ],
      { rootId: 'app 0.1.0' }
    );

    expect(resolveStandaloneBinary(metadata, 'src/main.rs', '/work').name).toBe(
      'server'
    );
  });

  it('throws an error naming both remedies when ambiguous', () => {
    expect(() =>
      resolveStandaloneBinary(multiBin, 'src/main.rs', '/work')
    ).toThrow(/entrypoint[\s\S]*default-run/);
    expect(() =>
      resolveStandaloneBinary(multiBin, 'src/main.rs', '/work')
    ).toThrow(/worker, server/);
  });

  it('throws when there is no binary target', () => {
    const metadata = makeMetadata(
      [{ name: 'app', id: 'app 0.1.0', bins: [] }],
      { rootId: 'app 0.1.0' }
    );

    expect(() =>
      resolveStandaloneBinary(metadata, 'src/main.rs', '/work')
    ).toThrow(/No binary target/);
  });

  describe('workspaces', () => {
    // Virtual manifest: `resolve.root` is null, which used to throw outright.
    const virtualWorkspace = (defaultMembers?: string[]) =>
      makeMetadata(
        [
          {
            name: 'api',
            id: 'api 0.1.0',
            manifest_path: '/work/crates/api/Cargo.toml',
            bins: [{ name: 'api', src_path: '/work/crates/api/src/main.rs' }],
          },
          {
            name: 'worker',
            id: 'worker 0.1.0',
            manifest_path: '/work/crates/worker/Cargo.toml',
            bins: [
              { name: 'worker', src_path: '/work/crates/worker/src/main.rs' },
            ],
          },
        ],
        { rootId: null, defaultMembers }
      );

    it('resolves a member crate from the entrypoint path', () => {
      const binary = resolveStandaloneBinary(
        virtualWorkspace(),
        'crates/api/src/main.rs',
        '/work'
      );
      expect(binary).toMatchObject({ name: 'api', packageName: 'api' });
    });

    it('resolves a member crate from the bin name', () => {
      expect(
        resolveStandaloneBinary(virtualWorkspace(), 'worker', '/work')
      ).toMatchObject({ name: 'worker', packageName: 'worker' });
    });

    it('errors when a bin name is duplicated across packages', () => {
      const metadata = makeMetadata([
        {
          name: 'api',
          id: 'api 0.1.0',
          bins: [{ name: 'server', src_path: '/work/api/src/main.rs' }],
        },
        {
          name: 'admin',
          id: 'admin 0.1.0',
          bins: [{ name: 'server', src_path: '/work/admin/src/main.rs' }],
        },
      ]);

      expect(() =>
        resolveStandaloneBinary(metadata, 'server', '/work')
      ).toThrow(/ambiguous[\s\S]*api:server, admin:server/);
    });

    it('uses workspace_default_members when no entrypoint matches', () => {
      const binary = resolveStandaloneBinary(
        virtualWorkspace(['api 0.1.0']),
        'src/main.rs',
        '/work'
      );
      expect(binary.name).toBe('api');
    });

    it('throws listing package-qualified candidates when ambiguous', () => {
      expect(() =>
        resolveStandaloneBinary(virtualWorkspace(), 'src/main.rs', '/work')
      ).toThrow(/api, worker/);
    });

    it('ignores registry dependencies that are not workspace members', () => {
      const metadata = makeMetadata(
        [
          {
            name: 'app',
            id: 'app 0.1.0',
            manifest_path: '/work/Cargo.toml',
            bins: [{ name: 'app', src_path: '/work/src/main.rs' }],
          },
        ],
        { rootId: 'app 0.1.0' }
      );
      // A dependency with its own bin target, as `cargo metadata` reports it.
      (metadata.packages as unknown as FakePackage[]).push({
        name: 'some-dep',
        id: 'some-dep 1.0.0',
        manifest_path: '/registry/some-dep/Cargo.toml',
        bins: [
          { name: 'some-dep', src_path: '/registry/some-dep/src/main.rs' },
        ],
      } as never);

      expect(
        resolveStandaloneBinary(metadata, 'src/main.rs', '/work').name
      ).toBe('app');
    });
  });
});

describe('resolvedPackageUsesVercelRuntime', () => {
  const binary = {
    name: 'api',
    packageId: 'api 0.1.0',
    packageName: 'api',
    srcPath: '/work/api/src/main.rs',
  };

  it('follows a renamed dependency to the resolved package', () => {
    const metadata = makeMetadata([
      {
        name: 'api',
        id: binary.packageId,
        bins: [{ name: 'api', src_path: binary.srcPath }],
        dependencies: [{ name: 'vc', packageName: 'vercel_runtime' }],
      },
    ]);

    expect(resolvedPackageUsesVercelRuntime(metadata, binary)).toBe(true);
  });

  it('ignores an optional dependency that was not resolved', () => {
    const metadata = makeMetadata([
      {
        name: 'api',
        id: binary.packageId,
        bins: [{ name: 'api', src_path: binary.srcPath }],
        dependencies: [{ name: 'vercel_runtime', resolved: false }],
      },
    ]);

    expect(resolvedPackageUsesVercelRuntime(metadata, binary)).toBe(false);
  });

  it('uses only the selected workspace package', () => {
    const metadata = makeMetadata([
      {
        name: 'api',
        id: binary.packageId,
        bins: [{ name: 'api', src_path: binary.srcPath }],
      },
      {
        name: 'worker',
        id: 'worker 0.1.0',
        bins: [{ name: 'worker', src_path: '/work/worker/src/main.rs' }],
        dependencies: [{ name: 'vercel_runtime' }],
      },
    ]);

    expect(resolvedPackageUsesVercelRuntime(metadata, binary)).toBe(false);
  });
});

describe('assertStandaloneBinary', () => {
  const binary = {
    name: 'api',
    packageName: 'api',
    srcPath: '/work/crates/api/src/main.rs',
  };

  it('throws when the owning package depends on vercel_runtime', () => {
    const metadata = makeMetadata(
      [
        {
          name: 'api',
          id: 'api 0.1.0',
          dependencies: [{ name: 'tokio' }, { name: 'vercel_runtime' }],
          bins: [{ name: 'api', src_path: binary.srcPath }],
        },
      ],
      { rootId: 'api 0.1.0' }
    );

    expect(() => assertStandaloneBinary(metadata, binary, '/work')).toThrow(
      /vercel_runtime[\s\S]*crates\/api\/src\/main\.rs/
    );
  });

  it('accepts a package that only has vercel_runtime as a dev-dependency', () => {
    const metadata = makeMetadata(
      [
        {
          name: 'api',
          id: 'api 0.1.0',
          dependencies: [
            { name: 'tokio' },
            { name: 'vercel_runtime', kind: 'dev' },
          ],
          bins: [{ name: 'api', src_path: binary.srcPath }],
        },
      ],
      { rootId: 'api 0.1.0' }
    );

    expect(() =>
      assertStandaloneBinary(metadata, binary, '/work')
    ).not.toThrow();
  });

  it('accepts a package without the crate', () => {
    const metadata = makeMetadata(
      [
        {
          name: 'api',
          id: 'api 0.1.0',
          dependencies: [{ name: 'axum' }],
          bins: [{ name: 'api', src_path: binary.srcPath }],
        },
      ],
      { rootId: 'api 0.1.0' }
    );

    expect(() =>
      assertStandaloneBinary(metadata, binary, '/work')
    ).not.toThrow();
  });
});

describe('missingEntrypointError', () => {
  it('points framework builds at a standalone server', () => {
    const err = missingEntrypointError('src/main.rs', false);
    expect(err.message).toBe(
      'This project depends on `vercel_runtime` but `src/main.rs` was not found. ' +
        'To deploy a standalone server, add a `src/main.rs` and remove the `vercel_runtime` dependency.'
    );
  });

  it('keeps the plain missing-file error for api handler builds', () => {
    const err = missingEntrypointError('api/handler.rs', true);
    expect(err.message).toBe(
      'Entrypoint "api/handler.rs" was not found. Make sure the file exists, or set the entrypoint to the Rust source file you want to deploy.'
    );
    expect(err.message).not.toContain('vercel_runtime');
  });
});

describe('excludeCargoTargetDir', () => {
  const files = {
    'Cargo.toml': 'toml' as never,
    'src/main.rs': 'main' as never,
    'target/release/app': 'binary' as never,
    'target/debug/deps/app.d': 'dep' as never,
    'targets/keep.rs': 'not the target dir' as never,
  };

  it('drops cargo build output so download() cannot truncate the binary', () => {
    expect(Object.keys(excludeCargoTargetDir(files, {}))).toEqual([
      'Cargo.toml',
      'src/main.rs',
      'targets/keep.rs',
    ]);
  });

  it('honors CARGO_TARGET_DIR', () => {
    const custom = {
      'src/main.rs': 'main' as never,
      'build-out/release/app': 'binary' as never,
      'target/release/app': 'kept' as never,
    };

    expect(
      Object.keys(
        excludeCargoTargetDir(custom, { CARGO_TARGET_DIR: 'build-out/' })
      )
    ).toEqual(['src/main.rs', 'target/release/app']);
  });

  it('normalizes a ./-prefixed CARGO_TARGET_DIR', () => {
    const custom = {
      'src/main.rs': 'main' as never,
      'build-out/release/app': 'binary' as never,
    };

    expect(
      Object.keys(
        excludeCargoTargetDir(custom, { CARGO_TARGET_DIR: './build-out' })
      )
    ).toEqual(['src/main.rs']);
  });

  it('handles an absolute CARGO_TARGET_DIR inside the project', () => {
    const custom = {
      'src/main.rs': 'main' as never,
      'build-out/release/app': 'binary' as never,
    };

    expect(
      Object.keys(
        excludeCargoTargetDir(
          custom,
          { CARGO_TARGET_DIR: '/work/build-out' },
          '/work'
        )
      )
    ).toEqual(['src/main.rs']);
  });

  it('excludes nothing for an absolute CARGO_TARGET_DIR outside the project', () => {
    const custom = {
      'src/main.rs': 'main' as never,
      'build-out/release/app': 'not cargo output' as never,
    };

    expect(
      Object.keys(
        excludeCargoTargetDir(
          custom,
          { CARGO_TARGET_DIR: '/elsewhere/build-out' },
          '/work'
        )
      )
    ).toEqual(['src/main.rs', 'build-out/release/app']);
  });

  // The default ignore list only adds `/target` when a `Cargo.toml` sits at the
  // project root, so a nested crate's build output arrives unfiltered.
  it('drops a nested crate build output', () => {
    const monorepo = {
      'package.json': 'root' as never,
      'apps/api/Cargo.toml': 'toml' as never,
      'apps/api/src/main.rs': 'main' as never,
      'apps/api/target/release/app': 'binary' as never,
      'apps/web/index.html': 'page' as never,
    };

    expect(Object.keys(excludeCargoTargetDir(monorepo, {}))).toEqual([
      'package.json',
      'apps/api/Cargo.toml',
      'apps/api/src/main.rs',
      'apps/web/index.html',
    ]);
  });

  it('drops a nested CARGO_TARGET_DIR', () => {
    const monorepo = {
      'apps/api/Cargo.toml': 'toml' as never,
      'apps/api/build-out/release/app': 'binary' as never,
      'apps/api/src/main.rs': 'main' as never,
    };

    expect(
      Object.keys(
        excludeCargoTargetDir(monorepo, { CARGO_TARGET_DIR: 'build-out' })
      )
    ).toEqual(['apps/api/Cargo.toml', 'apps/api/src/main.rs']);
  });

  // Anchoring on manifests, rather than matching `/target/` anywhere, is what
  // keeps a Rust module directory named `target` in the deployment.
  it('keeps a source directory named `target` that is not a crate root', () => {
    const withModule = {
      'Cargo.toml': 'toml' as never,
      'src/target/mod.rs': 'a module, not cargo output' as never,
      'target/release/app': 'binary' as never,
    };

    expect(Object.keys(excludeCargoTargetDir(withModule, {}))).toEqual([
      'Cargo.toml',
      'src/target/mod.rs',
    ]);
  });

  it('drops it when that directory really is a crate root', () => {
    const nestedCrate = {
      'Cargo.toml': 'toml' as never,
      'src/Cargo.toml': 'nested crate' as never,
      'src/target/release/app': 'binary' as never,
    };

    expect(Object.keys(excludeCargoTargetDir(nestedCrate, {}))).toEqual([
      'Cargo.toml',
      'src/Cargo.toml',
    ]);
  });

  // `Cargo.toml` can itself be ignored or absent from the map, so the
  // project-root target dir is dropped regardless.
  it('drops the root target dir without a manifest in the file map', () => {
    const noManifest = {
      'src/main.rs': 'main' as never,
      'target/release/app': 'binary' as never,
    };

    expect(Object.keys(excludeCargoTargetDir(noManifest, {}))).toEqual([
      'src/main.rs',
    ]);
  });
});
