import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectImportClosure, extractImports } from '../src';

/**
 * Fixture tree built per test run in a temp dir. Layout:
 *
 *   app/                     <- search root 0 (shadows vendor)
 *     main.py                entrypoint
 *     pkg/__init__.py        `from . import core`, lazy import in function
 *     pkg/core.py            `from vendor_pkg import thing`
 *     pkg/util.py            only reachable via TYPE_CHECKING
 *     requests.py            shadows the vendored `requests` package
 *   venv/site-packages/      <- search root 1
 *     vendor_pkg/__init__.py namespace-relative imports, sub-package chain
 *     vendor_pkg/deep/mod.py reached via `import vendor_pkg.deep.mod`
 *     vendor_pkg/lazy_mod.py only imported inside a function -> excluded
 *     requests/__init__.py   shadowed by app/requests.py
 *     unseen/__init__.py     never imported anywhere
 */

let tmpDir: string;
let appRoot: string;
let sitePackages: string;

function write(rel: string, content: string) {
  const abs = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-graph-test-'));
  appRoot = path.join(tmpDir, 'app');
  sitePackages = path.join(tmpDir, 'venv', 'site-packages');

  write('app/main.py', 'from pkg import core\nimport requests\n');
  write(
    'app/pkg/__init__.py',
    'from . import core\ndef f():\n    import vendor_pkg.lazy_mod\n'
  );
  write(
    'app/pkg/core.py',
    'from vendor_pkg import thing\nfrom typing import TYPE_CHECKING\n' +
      'if TYPE_CHECKING:\n    from . import util\n'
  );
  write('app/pkg/util.py', '# only reachable via TYPE_CHECKING\n');
  write('app/requests.py', '# app-local module shadows the vendored package\n');

  write(
    'venv/site-packages/vendor_pkg/__init__.py',
    'from . import thing\nimport vendor_pkg.deep.mod\n'
  );
  write(
    'venv/site-packages/vendor_pkg/thing.py',
    'try:\n    import ujson\nexcept ImportError:\n    import json\n'
  );
  write('venv/site-packages/vendor_pkg/deep/__init__.py', '');
  write('venv/site-packages/vendor_pkg/deep/mod.py', '');
  write('venv/site-packages/vendor_pkg/lazy_mod.py', '');
  write('venv/site-packages/requests/__init__.py', '# vendored, shadowed\n');
  write('venv/site-packages/unseen/__init__.py', '');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function rel(paths: Set<string>): string[] {
  return [...paths]
    .map(p => path.relative(tmpDir, p).split(path.sep).join('/'))
    .sort();
}

describe('extractImports', () => {
  it('flags module-level vs lazy and TYPE_CHECKING imports', async () => {
    const stmts = await extractImports(
      'import a\ndef f():\n    import b\nif TYPE_CHECKING:\n    import c\n'
    );
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toMatchObject({ module: 'a', isModuleLevel: true });
    expect(stmts[1]).toMatchObject({ module: 'b', isModuleLevel: false });
    expect(stmts[2]).toMatchObject({ module: 'c', inTypeChecking: true });
  });

  it('captures relative level and from-import names', async () => {
    const stmts = await extractImports('from ..pkg import x, y\n');
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toMatchObject({
      module: 'pkg',
      level: 2,
      names: ['x', 'y'],
    });
  });

  it('returns an empty list for invalid syntax', async () => {
    expect(await extractImports('def broken(')).toEqual([]);
  });
});

describe('collectImportClosure', () => {
  it('computes the transitive closure with shadowing and parent chains', async () => {
    const { files, truncated } = await collectImportClosure({
      seeds: [path.join(appRoot, 'main.py')],
      searchRoots: [appRoot, sitePackages],
    });

    expect(truncated).toBe(false);
    expect(rel(files)).toEqual([
      'app/main.py',
      'app/pkg/__init__.py',
      'app/pkg/core.py',
      // app module shadows the vendored `requests` package
      'app/requests.py',
      'venv/site-packages/vendor_pkg/__init__.py',
      'venv/site-packages/vendor_pkg/deep/__init__.py',
      'venv/site-packages/vendor_pkg/deep/mod.py',
      'venv/site-packages/vendor_pkg/thing.py',
    ]);
  });

  it('resolves dotted-name seeds against the search roots', async () => {
    const { files } = await collectImportClosure({
      seeds: ['vendor_pkg.deep.mod'],
      searchRoots: [appRoot, sitePackages],
    });

    // Parent packages execute on import: both __init__ files are included.
    expect(rel(files)).toEqual([
      'venv/site-packages/vendor_pkg/__init__.py',
      'venv/site-packages/vendor_pkg/deep/__init__.py',
      'venv/site-packages/vendor_pkg/deep/mod.py',
      'venv/site-packages/vendor_pkg/thing.py',
    ]);
  });

  it('resolves the longest importable prefix of object-path seeds', async () => {
    write('app/myapp/__init__.py', '');
    write('app/myapp/apps.py', '');

    const { files } = await collectImportClosure({
      seeds: ['myapp.apps.MyAppConfig'],
      searchRoots: [appRoot, sitePackages],
    });

    expect(rel(files)).toEqual(['app/myapp/__init__.py', 'app/myapp/apps.py']);
  });

  it('prefers a package over a same-named module file', async () => {
    write('app/collision.py', 'import module_winner\n');
    write('app/collision/__init__.py', 'import package_winner\n');
    write('app/module_winner.py', '');
    write('app/package_winner.py', '');

    const { files } = await collectImportClosure({
      seeds: ['collision'],
      searchRoots: [appRoot],
    });

    expect(rel(files)).toEqual([
      'app/collision/__init__.py',
      'app/package_winner.py',
    ]);
  });

  it('includes both branches of module-level try/except', async () => {
    const { files } = await collectImportClosure({
      seeds: ['vendor_pkg.thing'],
      searchRoots: [sitePackages],
    });
    // ujson is missing (skipped silently); json is stdlib (skipped silently).
    expect(rel(files)).toEqual([
      'venv/site-packages/vendor_pkg/__init__.py',
      'venv/site-packages/vendor_pkg/deep/__init__.py',
      'venv/site-packages/vendor_pkg/deep/mod.py',
      'venv/site-packages/vendor_pkg/thing.py',
    ]);
  });

  it('marks the result truncated when maxFiles is exceeded', async () => {
    const { truncated } = await collectImportClosure({
      seeds: [path.join(appRoot, 'main.py')],
      searchRoots: [appRoot, sitePackages],
      maxFiles: 2,
    });
    expect(truncated).toBe(true);
  });

  it('survives cycles', async () => {
    write('app/cycle_a.py', 'import cycle_b\n');
    write('app/cycle_b.py', 'import cycle_a\n');
    const { files } = await collectImportClosure({
      seeds: [path.join(appRoot, 'cycle_a.py')],
      searchRoots: [appRoot, sitePackages],
    });
    expect(rel(files)).toEqual(['app/cycle_a.py', 'app/cycle_b.py']);
  });

  it('shares filesystem probes for repeated imports and misses', async () => {
    write('app/cache_seed.py', 'import cache_first\nimport cache_second\n');
    write('app/cache_first.py', 'import cache_shared\nimport cache_missing\n');
    write('app/cache_second.py', 'import cache_shared\nimport cache_missing\n');
    write('app/cache_shared.py', '');

    const statSpy = vi.spyOn(fs.promises, 'stat');
    try {
      const { files } = await collectImportClosure({
        seeds: [path.join(appRoot, 'cache_seed.py')],
        searchRoots: [appRoot, sitePackages],
      });

      expect(rel(files)).toEqual([
        'app/cache_first.py',
        'app/cache_second.py',
        'app/cache_seed.py',
        'app/cache_shared.py',
      ]);

      const statCounts = new Map<string, number>();
      for (const [candidate] of statSpy.mock.calls) {
        const candidatePath = String(candidate);
        statCounts.set(candidatePath, (statCounts.get(candidatePath) ?? 0) + 1);
      }

      const sharedCandidates = [
        path.join(appRoot, 'cache_shared', '__init__.py'),
        path.join(appRoot, 'cache_shared.py'),
      ];
      const missingCandidates = [appRoot, sitePackages].flatMap(root => [
        path.join(root, 'cache_missing', '__init__.py'),
        path.join(root, 'cache_missing.py'),
        path.join(root, 'cache_missing'),
      ]);

      for (const candidate of [...sharedCandidates, ...missingCandidates]) {
        expect(statCounts.get(candidate)).toBe(1);
      }
    } finally {
      statSpy.mockRestore();
    }
  });

  it('does not retain resolution misses between closure runs', async () => {
    write('app/cache_scope_seed.py', 'import cache_scope_late\n');

    const first = await collectImportClosure({
      seeds: [path.join(appRoot, 'cache_scope_seed.py')],
      searchRoots: [appRoot],
    });
    expect(rel(first.files)).toEqual(['app/cache_scope_seed.py']);

    write('app/cache_scope_late.py', '');
    const second = await collectImportClosure({
      seeds: [path.join(appRoot, 'cache_scope_seed.py')],
      searchRoots: [appRoot],
    });
    expect(rel(second.files)).toEqual([
      'app/cache_scope_late.py',
      'app/cache_scope_seed.py',
    ]);
  });
});
