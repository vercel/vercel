/**
 * Static import-graph analysis: compute the transitive closure of modules a
 * Python application imports at startup, without executing any user code.
 *
 * The closure feeds bytecode packing. Both error directions are safe:
 * over-included modules waste capacity, and missed modules (plugin loaders,
 * imports made by compiled extensions) still ship from residual capacity.
 *
 * Resolution semantics mirror CPython:
 * - dotted name -> `a/b/__init__.py` | `a/b.py` | PEP 420 namespace dir
 * - importing `a.b.c` executes every parent `__init__.py` (emitted + recursed)
 * - `from a import b` probes `b` as a submodule of `a`
 * - relative imports resolve against the importer's package by dot level
 * - first search root wins, so app modules shadow vendor (runtime sys.path)
 *
 * Startup heuristics (applied on top of the raw WASM extraction):
 * - imports inside function bodies are lazy and excluded
 * - `if TYPE_CHECKING:` blocks never run at runtime and are excluded
 * - both branches of module-level `if` / `try` are included
 */

import fs from 'fs';
import { isAbsolute, join, dirname, resolve, sep } from 'path';
import { importWasmModule } from '../wasm/load';

export interface ImportStmt {
  /** Dotted module path for from-imports; undefined for `from . import x`. */
  module?: string;
  /** Relative-import level (number of leading dots). 0 = absolute. */
  level: number;
  /** Imported names for from-imports (each may be a submodule). */
  names: string[];
  /** False when nested in a function body (lazy import). */
  isModuleLevel: boolean;
  /** True when under `if TYPE_CHECKING:` (never runs at runtime). */
  inTypeChecking: boolean;
}

/**
 * Extract every import statement in Python source with its syntactic
 * context. Returns an empty list for invalid syntax.
 */
export async function extractImports(source: string): Promise<ImportStmt[]> {
  // Cheap pre-filter: the WASM parse is wasted on files without imports.
  if (!source.includes('import')) {
    return [];
  }
  const mod = await importWasmModule();
  return mod.extractImports(source);
}

export interface ImportClosureOptions {
  /**
   * Entry points of the closure: absolute `.py` file paths and/or dotted
   * module or object names (e.g. Django's ROOT_URLCONF / INSTALLED_APPS
   * strings), resolved to their longest importable prefix against searchRoots.
   */
  seeds: string[];
  /**
   * Ordered module search roots (e.g. [workPath, ...sitePackageDirs]).
   * First match wins, so earlier roots shadow later ones.
   */
  searchRoots: string[];
  /**
   * Approximate safety bound on parsed files, checked per frontier batch.
   * On overflow the partial closure is returned with `truncated: true`
   * (remaining modules fall to the residual bytecode tier).
   */
  maxFiles?: number;
}

export interface ImportClosureResult {
  /** Absolute paths of every `.py` file imported at startup. */
  files: Set<string>;
  truncated: boolean;
}

const DEFAULT_MAX_FILES = 30000;

type FsKind = 'file' | 'dir' | null;

interface ResolutionCache {
  statKinds: Map<string, Promise<FsKind>>;
  names: Map<string, Promise<ResolvedName | null>>;
}

async function readStatKind(path: string): Promise<FsKind> {
  try {
    const stats = await fs.promises.stat(path);
    if (stats.isFile()) return 'file';
    if (stats.isDirectory()) return 'dir';
  } catch {
    // unreadable / missing
  }
  return null;
}

function statKind(path: string, cache: ResolutionCache): Promise<FsKind> {
  const cached = cache.statKinds.get(path);
  if (cached) return cached;

  const pending = readStatKind(path);
  cache.statKinds.set(path, pending);
  return pending;
}

interface ResolvedName {
  /** Resolved module file, or a directory for a namespace package. */
  target: string;
  targetKind: FsKind;
  /** `__init__.py` of every parent package (executed on import). */
  parentChain: string[];
}

/**
 * Resolve dotted parts under each search dir. Importing `a.b.c` executes the
 * `__init__.py` of `a` and `a.b`, so the parent chain is emitted alongside.
 */
async function resolveNamePartsUncached(
  parts: string[],
  searchDirs: string[],
  cache: ResolutionCache
): Promise<ResolvedName | null> {
  const rel = join(...parts);
  for (const root of searchDirs) {
    let target: string | null = null;
    let targetKind: FsKind = null;
    const candidateInit = join(root, rel, '__init__.py');
    if ((await statKind(candidateInit, cache)) === 'file') {
      target = candidateInit;
      targetKind = 'file';
    } else {
      const candidateModule = join(root, `${rel}.py`);
      if ((await statKind(candidateModule, cache)) === 'file') {
        target = candidateModule;
        targetKind = 'file';
      } else if ((await statKind(join(root, rel), cache)) === 'dir') {
        target = join(root, rel);
        targetKind = 'dir'; // PEP 420 namespace package
      }
    }
    if (target !== null) {
      const parentChain: string[] = [];
      let acc = root;
      for (const part of parts.slice(0, -1)) {
        acc = join(acc, part);
        const init = join(acc, '__init__.py');
        if ((await statKind(init, cache)) === 'file') {
          parentChain.push(init);
        }
      }
      return { target, targetKind, parentChain };
    }
  }
  return null;
}

/**
 * `searchKey` must uniquely identify `searchDirs` (precomputed once per
 * dir set — building keys per call dominated resolution on large apps).
 */
function resolveNameParts(
  parts: string[],
  searchDirs: string[],
  searchKey: string,
  cache: ResolutionCache
): Promise<ResolvedName | null> {
  if (parts.length === 0) return Promise.resolve(null);

  const key = `${searchKey}\0${parts.join('.')}`;
  const cached = cache.names.get(key);
  if (cached) return cached;

  const pending = resolveNamePartsUncached(parts, searchDirs, cache);
  cache.names.set(key, pending);
  return pending;
}

/** Resolve a seed that may end in an object name rather than a module. */
async function resolveSeedName(
  parts: string[],
  searchDirs: string[],
  searchKey: string,
  cache: ResolutionCache
): Promise<ResolvedName | null> {
  for (let length = parts.length; length > 0; length--) {
    const resolved = await resolveNameParts(
      parts.slice(0, length),
      searchDirs,
      searchKey,
      cache
    );
    if (resolved) return resolved;
  }
  return null;
}

/** Directory to search for submodules of the module at `target`. */
function submoduleDir(target: string, targetKind: FsKind): string | null {
  if (targetKind === 'dir') return target;
  if (targetKind === 'file' && target.endsWith(`${sep}__init__.py`)) {
    return dirname(target);
  }
  return null;
}

/**
 * Resolve one import statement to the files it executes (module itself plus
 * parent packages). Unresolvable names (stdlib, missing) are skipped — they
 * are never part of the bundle.
 */
async function resolveImport(
  stmt: ImportStmt,
  importerPath: string,
  roots: string[],
  rootsKey: string,
  cache: ResolutionCache
): Promise<string[]> {
  const resolved = new Set<string>();

  let search = roots;
  let searchKey = rootsKey;
  if (stmt.level > 0) {
    // level=1 -> the importer's own package directory.
    let base = dirname(importerPath);
    for (let i = 1; i < stmt.level; i++) {
      base = dirname(base);
    }
    search = [base];
    searchKey = base;
  }

  const parts = stmt.module ? stmt.module.split('.') : [];
  let target: string;
  let targetKind: FsKind;
  if (parts.length > 0) {
    const name = await resolveNameParts(parts, search, searchKey, cache);
    if (!name) return [];
    target = name.target;
    targetKind = name.targetKind;
    if (targetKind === 'file') resolved.add(target);
    for (const init of name.parentChain) {
      resolved.add(init);
    }
  } else if (stmt.level > 0) {
    // `from . import x` -> names resolved in the importer's package dir.
    target = search[0];
    targetKind = 'dir';
  } else {
    return [];
  }

  // For from-imports, each imported name may itself be a submodule.
  const subDir = submoduleDir(target, targetKind);
  if (subDir) {
    for (const name of stmt.names) {
      if (name === '*') continue;
      const sub = await resolveNameParts([name], [subDir], subDir, cache);
      if (sub) {
        if (sub.targetKind === 'file') resolved.add(sub.target);
        for (const init of sub.parentChain) {
          resolved.add(init);
        }
      }
    }
  }

  return [...resolved];
}

/** True when a seed looks like a dotted module name rather than a path. */
function isModuleNameSeed(seed: string): boolean {
  return !isAbsolute(seed) && /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(seed);
}

/**
 * Compute the transitive closure of modules imported at startup.
 *
 * Only module-level imports outside `if TYPE_CHECKING:` blocks are followed
 * (see module docstring). Files are read and parsed frontier-by-frontier in
 * parallel; cycles are cut by the visited set.
 */
export async function collectImportClosure({
  seeds,
  searchRoots,
  maxFiles = DEFAULT_MAX_FILES,
}: ImportClosureOptions): Promise<ImportClosureResult> {
  const roots = searchRoots.map(r => resolve(r));
  const rootsKey = roots.join('\0');
  const cache: ResolutionCache = {
    statKinds: new Map(),
    names: new Map(),
  };
  const visited = new Set<string>();
  let frontier: string[] = [];
  let truncated = false;

  for (const seed of seeds) {
    if (isModuleNameSeed(seed)) {
      const name = await resolveSeedName(
        seed.split('.'),
        roots,
        rootsKey,
        cache
      );
      if (name) {
        if (name.targetKind === 'file') frontier.push(name.target);
        frontier.push(...name.parentChain);
      }
    } else {
      const seedPath = resolve(seed);
      if ((await statKind(seedPath, cache)) === 'file') {
        frontier.push(seedPath);
      }
    }
  }

  while (frontier.length > 0) {
    const batch = [...new Set(frontier)].filter(p => !visited.has(p));
    frontier = [];
    if (batch.length === 0) continue;

    for (const path of batch) {
      visited.add(path);
    }
    // Checked per batch: visited may overshoot maxFiles by one frontier,
    // and the final batch joins the closure unparsed. Both are safe —
    // truncation only shrinks the ranking input.
    if (visited.size > maxFiles) {
      truncated = true;
      break;
    }

    const dependencies = await Promise.all(
      batch.map(async importerPath => {
        let source: string;
        try {
          source = await fs.promises.readFile(importerPath, 'utf8');
        } catch {
          return [];
        }
        const stmts = await extractImports(source);
        const files = await Promise.all(
          stmts
            .filter(s => s.isModuleLevel && !s.inTypeChecking)
            .map(s => resolveImport(s, importerPath, roots, rootsKey, cache))
        );
        return files.flat();
      })
    );

    for (const dep of dependencies.flat()) {
      if (!visited.has(dep)) {
        frontier.push(dep);
      }
    }
  }

  return { files: visited, truncated };
}
