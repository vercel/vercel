import fs from 'fs';
import path from 'path';
import {
  writeProjectManifest,
  createDiagnostics,
  debug,
  MANIFEST_VERSION,
  type PackageManifest,
  type PackageManifestDependency,
} from '@vercel/build-utils';
import type { NodeVersion } from '@vercel/build-utils';

type CliType = 'yarn' | 'npm' | 'pnpm' | 'bun' | 'vlt';

interface LockEntry {
  resolved: string;
  scopes: string[];
  source?: string;
  sourceUrl?: string;
}

function classifySource(resolvedUrl: string | undefined): {
  source?: string;
  sourceUrl?: string;
} {
  if (!resolvedUrl) return {};
  if (resolvedUrl.startsWith('file:')) {
    return { source: 'file', sourceUrl: resolvedUrl.slice('file:'.length) };
  }
  if (resolvedUrl.startsWith('git+') || resolvedUrl.startsWith('git://')) {
    return { source: 'git', sourceUrl: resolvedUrl.replace(/^git\+/, '') };
  }
  try {
    const url = new URL(resolvedUrl);
    return { source: 'registry', sourceUrl: url.origin };
  } catch {
    return {};
  }
}

function npmEntryScopes(entry: Record<string, unknown>): string[] {
  const scopes: string[] = [];
  if (entry.dev) scopes.push('dev');
  if (entry.peer) scopes.push('peer');
  if (entry.optional) scopes.push('optional');
  if (scopes.length === 0) scopes.push('prod');
  return scopes;
}

function parseNpmLock(
  content: string,
  lockfileVersion: number | undefined
): Map<string, LockEntry> {
  const lockMap = new Map<string, LockEntry>();
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const lv = lockfileVersion ?? (parsed.lockfileVersion as number) ?? 1;

  if (lv >= 2) {
    const packages = parsed.packages as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!packages) return lockMap;

    for (const [key, entry] of Object.entries(packages)) {
      if (key === '') continue; // root package
      if (!key.startsWith('node_modules/')) continue;
      if (entry.link === true) continue; // workspace symlink

      const rest = key.slice('node_modules/'.length);
      // Keep only top-level entries: 'foo' or '@scope/pkg', not 'foo/node_modules/bar'
      const isScoped = rest.startsWith('@');
      const slashCount = (rest.match(/\//g) ?? []).length;
      if (isScoped ? slashCount !== 1 : slashCount !== 0) continue;

      const resolved = entry.resolved as string | undefined;
      if (resolved?.startsWith('file:')) continue; // local/workspace package

      if (lockMap.has(rest)) continue; // keep first occurrence

      const { source, sourceUrl } = classifySource(resolved);
      const lockEntry: LockEntry = {
        resolved: (entry.version as string) ?? '',
        scopes: npmEntryScopes(entry),
      };
      if (source) lockEntry.source = source;
      if (sourceUrl) lockEntry.sourceUrl = sourceUrl;
      lockMap.set(rest, lockEntry);
    }
  } else {
    // v1: flat dependencies object, potentially nested for workspaces
    const dependencies = parsed.dependencies as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!dependencies) return lockMap;

    const walk = (deps: Record<string, Record<string, unknown>>) => {
      for (const [name, entry] of Object.entries(deps)) {
        const resolved = entry.resolved as string | undefined;
        if (!lockMap.has(name)) {
          if (!resolved?.startsWith('file:')) {
            const { source, sourceUrl } = classifySource(resolved);
            const lockEntry: LockEntry = {
              resolved: (entry.version as string) ?? '',
              scopes: npmEntryScopes(entry),
            };
            if (source) lockEntry.source = source;
            if (sourceUrl) lockEntry.sourceUrl = sourceUrl;
            lockMap.set(name, lockEntry);
          }
        }
        const nested = entry.dependencies as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (nested) walk(nested);
      }
    };
    walk(dependencies);
  }

  return lockMap;
}

async function parseLockfile(
  cliType: CliType,
  lockfilePath: string,
  lockfileVersion: number | undefined
): Promise<Map<string, LockEntry>> {
  const content = await fs.promises.readFile(lockfilePath, 'utf-8');
  switch (cliType) {
    case 'npm':
      return parseNpmLock(content, lockfileVersion);
    default:
      return new Map();
  }
}

async function readPackageJson(
  startDir: string
): Promise<Record<string, unknown> | null> {
  let current = startDir;
  for (;;) {
    try {
      const content = await fs.promises.readFile(
        path.join(current, 'package.json'),
        'utf-8'
      );
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

function buildDirectMaps(pkgJson: Record<string, unknown>): {
  directScopes: Map<string, Set<string>>;
  directRequested: Map<string, string>;
} {
  const directScopes = new Map<string, Set<string>>();
  const directRequested = new Map<string, string>();

  const add = (deps: unknown, scope: string) => {
    if (!deps || typeof deps !== 'object') return;
    for (const [name, specifier] of Object.entries(
      deps as Record<string, string>
    )) {
      if (!directScopes.has(name)) directScopes.set(name, new Set());
      directScopes.get(name)!.add(scope);
      if (!directRequested.has(name)) directRequested.set(name, specifier);
    }
  };

  add(pkgJson.dependencies, 'prod');
  add(pkgJson.devDependencies, 'dev');
  add(pkgJson.peerDependencies, 'peer');
  add(pkgJson.optionalDependencies, 'optional');

  return { directScopes, directRequested };
}

export async function generateProjectManifest({
  workPath,
  nodeVersion,
  cliType,
  lockfilePath,
  lockfileVersion,
}: {
  workPath: string;
  nodeVersion: NodeVersion;
  cliType: CliType;
  lockfilePath: string | undefined;
  lockfileVersion: number | undefined;
}): Promise<void> {
  try {
    const pkgJson = await readPackageJson(workPath);
    if (!pkgJson) return;

    const { directScopes, directRequested } = buildDirectMaps(pkgJson);

    const lockMap = lockfilePath
      ? await parseLockfile(cliType, lockfilePath, lockfileVersion)
      : new Map<string, LockEntry>();

    const directDeps: PackageManifestDependency[] = [];
    const transitiveDeps: PackageManifestDependency[] = [];

    for (const [name, scopes] of directScopes) {
      const lock = lockMap.get(name);
      const dep: PackageManifestDependency = {
        name,
        type: 'direct',
        scopes: [...scopes].sort(),
        requested: directRequested.get(name),
        resolved: lock?.resolved ?? '',
      };
      if (lock?.source) dep.source = lock.source;
      if (lock?.sourceUrl) dep.sourceUrl = lock.sourceUrl;
      directDeps.push(dep);
    }

    for (const [name, lock] of lockMap) {
      if (directScopes.has(name)) continue;
      const dep: PackageManifestDependency = {
        name,
        type: 'transitive',
        scopes: lock.scopes,
        resolved: lock.resolved,
      };
      if (lock.source) dep.source = lock.source;
      if (lock.sourceUrl) dep.sourceUrl = lock.sourceUrl;
      transitiveDeps.push(dep);
    }

    const manifest: PackageManifest = {
      version: MANIFEST_VERSION,
      runtime: 'node',
      runtimeVersion: {
        resolved: String(nodeVersion.major),
      },
      dependencies: [
        ...directDeps.sort((a, b) => a.name.localeCompare(b.name)),
        ...transitiveDeps.sort((a, b) => a.name.localeCompare(b.name)),
      ],
    };

    await writeProjectManifest(manifest, workPath, 'node');
  } catch (err) {
    debug(
      `generateProjectManifest: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export const diagnostics = createDiagnostics('node');
