import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { parseSyml } from '@yarnpkg/parsers';
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

      const version = (entry.version as string) ?? '';
      const existing = lockMap.get(rest);
      if (existing && !isHigherVersion(version, existing.resolved)) continue;

      const { source, sourceUrl } = classifySource(resolved);
      const lockEntry: LockEntry = {
        resolved: version,
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
        if (!resolved?.startsWith('file:')) {
          const version = (entry.version as string) ?? '';
          const existing = lockMap.get(name);
          if (!existing || isHigherVersion(version, existing.resolved)) {
            const { source, sourceUrl } = classifySource(resolved);
            const lockEntry: LockEntry = {
              resolved: version,
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

// Returns true if version a is higher than version b using numeric segment comparison.
// Good enough for semver; does not handle pre-release ordering.
function isHigherVersion(a: string, b: string): boolean {
  const seg = (v: string) => v.split(/[.\-+]/).map(s => parseInt(s, 10) || 0);
  const pa = seg(a);
  const pb = seg(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

// Shared: extract package name from a versioned specifier, stripping any peer
// dep suffix first. Works for: foo@1.2.3, @scope/pkg@1.2.3, foo@1.2.3(react@18),
// express@npm:^4.18.0 (yarn berry), @scope/pkg@npm:^1.0.0.
function extractPackageName(spec: string): string | null {
  const s = spec.replace(/\(.*\)$/, ''); // strip peer dep suffix
  if (s.startsWith('@')) {
    const i = s.indexOf('@', 1);
    return i === -1 ? null : s.slice(0, i);
  }
  const i = s.lastIndexOf('@');
  return i <= 0 ? null : s.slice(0, i);
}

function parsePnpmV9Key(key: string): { name: string; version: string } | null {
  const name = extractPackageName(key);
  if (!name) return null;
  const withoutPeers = key.replace(/\(.*\)$/, '');
  return { name, version: withoutPeers.slice(name.length + 1) };
}

// pnpm v5.x: /name/version(_peers) or /@scope/pkg/version(_peers)
function parsePnpmV5Key(key: string): { name: string; version: string } | null {
  if (!key.startsWith('/')) return null;
  const rest = key.slice(1);
  if (rest.startsWith('@')) {
    // Scoped: @scope/pkg/1.2.3(_peers)
    const firstSlash = rest.indexOf('/');
    if (firstSlash === -1) return null;
    const secondSlash = rest.indexOf('/', firstSlash + 1);
    if (secondSlash === -1) return null;
    const name = rest.slice(0, secondSlash);
    const version = rest.slice(secondSlash + 1).split('_')[0];
    return { name, version };
  }
  // Non-scoped: pkg/1.2.3(_peers)
  const slashIndex = rest.indexOf('/');
  if (slashIndex === -1) return null;
  const name = rest.slice(0, slashIndex);
  const version = rest.slice(slashIndex + 1).split('_')[0];
  return { name, version };
}

// pnpm v6.x: /name@version(_peers) or /@scope/pkg@version(_peers)
// Peer dep variants use '_' suffix (unlike v9 which uses '()')
function parsePnpmV6Key(key: string): { name: string; version: string } | null {
  if (!key.startsWith('/')) return null;
  const rest = key.slice(1); // strip leading '/'
  let atIdx: number;
  if (rest.startsWith('@')) {
    // Scoped: @scope/pkg@version_peers
    atIdx = rest.indexOf('@', 1);
  } else {
    // Non-scoped: pkg@version_peers
    atIdx = rest.indexOf('@');
  }
  if (atIdx === -1) return null;
  const name = rest.slice(0, atIdx);
  // pnpm v6 uses both '_peerinfo' and '(peerinfo)' suffixes
  const version = rest
    .slice(atIdx + 1)
    .split('_')[0]
    .replace(/\(.*\)$/, '');
  return { name, version };
}

function classifyPnpmResolution(
  resolution: Record<string, unknown> | undefined
): { source?: string; sourceUrl?: string; local?: boolean } {
  if (!resolution) return {};
  if (resolution.type === 'directory' || resolution.directory)
    return { local: true };
  if (typeof resolution.tarball === 'string')
    return classifySource(resolution.tarball);
  if (resolution.type === 'git' || typeof resolution.repo === 'string') {
    return {
      source: 'git',
      sourceUrl: (resolution.repo as string) ?? undefined,
    };
  }
  return {};
}

function parsePnpmLock(
  content: string,
  lockfileVersion: number | undefined
): Map<string, LockEntry> {
  const lockMap = new Map<string, LockEntry>();
  // pnpm lockfiles may have multiple YAML documents (starts with '---')
  const docs: Array<Record<string, unknown> | null> = [];
  yaml.safeLoadAll(content, doc =>
    docs.push(doc as Record<string, unknown> | null)
  );
  const parsedYaml = docs[0];
  if (!parsedYaml) return lockMap;

  const lv =
    lockfileVersion ?? Number((parsedYaml.lockfileVersion as string) ?? '0');
  const packages = parsedYaml.packages as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!packages) return lockMap;

  const parseKey =
    lv >= 9
      ? parsePnpmV9Key // name@version
      : lv >= 6
        ? parsePnpmV6Key // /name@version
        : parsePnpmV5Key; // /name/version

  for (const [key, entry] of Object.entries(packages)) {
    const keyParsed = parseKey(key);
    if (!keyParsed) continue;
    const { name, version } = keyParsed;

    const resolution = entry.resolution as Record<string, unknown> | undefined;
    const { local, source, sourceUrl } = classifyPnpmResolution(resolution);
    if (local) continue;

    const existing = lockMap.get(name);
    if (existing && !isHigherVersion(version, existing.resolved)) continue;

    const lockEntry: LockEntry = { resolved: version, scopes: ['prod'] };
    if (source) lockEntry.source = source;
    if (sourceUrl) lockEntry.sourceUrl = sourceUrl;
    lockMap.set(name, lockEntry);
  }

  return lockMap;
}

function parseYarnLock(
  content: string,
  lockfileVersion: number | undefined
): Map<string, LockEntry> {
  const lockMap = new Map<string, LockEntry>();
  const isBerry = (lockfileVersion ?? 1) >= 2;

  const parsed = parseSyml(content) as Record<
    string,
    Record<string, string> | undefined
  >;

  for (const [key, entry] of Object.entries(parsed)) {
    if (key === '__metadata' || !entry) continue;

    // Berry: skip workspace/linked packages
    if (isBerry && entry.linkType === 'soft') continue;

    const version = entry.version;
    if (!version) continue;

    // Extract source from resolved URL (v1 only — berry has no registry URL)
    let source: string | undefined;
    let sourceUrl: string | undefined;
    if (!isBerry && entry.resolved) {
      if (entry.resolved.startsWith('file:')) continue;
      const classified = classifySource(entry.resolved);
      source = classified.source;
      sourceUrl = classified.sourceUrl;
    }

    // Get package name from the first specifier in the (possibly comma-joined) key
    const specifiers = key.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    let name: string | null = null;
    for (const spec of specifiers) {
      name = extractPackageName(spec);
      if (name) break;
    }
    if (!name) continue;

    const existing = lockMap.get(name);
    if (existing && !isHigherVersion(version, existing.resolved)) continue;

    const lockEntry: LockEntry = { resolved: version, scopes: ['prod'] };
    if (source) lockEntry.source = source;
    if (sourceUrl) lockEntry.sourceUrl = sourceUrl;
    lockMap.set(name, lockEntry);
  }

  return lockMap;
}

function parseBunLock(content: string): Map<string, LockEntry> {
  const lockMap = new Map<string, LockEntry>();
  // bun.lock is JSONC — strip trailing commas before JSON.parse
  const json = content.replace(/,(\s*[}\]])/g, '$1');
  const parsed = JSON.parse(json) as Record<string, unknown>;

  // packages keys are plain package names; value[0] is "name@resolved-version"
  const packages = parsed.packages as Record<string, unknown[]> | undefined;
  if (!packages) return lockMap;

  for (const [name, value] of Object.entries(packages)) {
    if (!Array.isArray(value)) continue;
    const ref = value[0] as string | undefined;
    if (!ref || typeof ref !== 'string') continue;

    // Extract resolved version from "name@version" ref string
    const pkgName = extractPackageName(ref);
    if (!pkgName) continue;
    const version = ref.slice(pkgName.length + 1);
    if (!version) continue;

    // Skip local/workspace packages
    if (version.startsWith('file:') || version.startsWith('workspace:'))
      continue;

    const existingBun = lockMap.get(name);
    if (existingBun && !isHigherVersion(version, existingBun.resolved))
      continue;
    lockMap.set(name, { resolved: version, scopes: ['prod'] });
  }

  return lockMap;
}

async function parseLockfile(
  cliType: CliType,
  lockfilePath: string,
  lockfileVersion: number | undefined
): Promise<Map<string, LockEntry>> {
  // bun.lockb is a binary format — not parseable without invoking bun
  if (cliType === 'bun' && lockfileVersion === 0) return new Map();
  // vlt-lock.json format is undocumented — emit direct deps only
  if (cliType === 'vlt') return new Map();

  const content = await fs.promises.readFile(lockfilePath, 'utf-8');
  switch (cliType) {
    case 'npm':
      return parseNpmLock(content, lockfileVersion);
    case 'pnpm':
      return parsePnpmLock(content, lockfileVersion);
    case 'yarn':
      return parseYarnLock(content, lockfileVersion);
    case 'bun':
      return parseBunLock(content);
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
  framework,
}: {
  workPath: string;
  nodeVersion: NodeVersion;
  cliType: CliType;
  lockfilePath: string | undefined;
  lockfileVersion: number | undefined;
  framework?: string;
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

    const runtimeVersion: PackageManifest['runtimeVersion'] = {
      resolved: String(nodeVersion.major),
    };

    // Populate requested/requestedSource from engines.node, .node-version, .nvmrc
    const enginesNode = (pkgJson.engines as Record<string, string> | undefined)
      ?.node;
    if (enginesNode) {
      runtimeVersion.requested = enginesNode;
      runtimeVersion.requestedSource = 'package.json';
    } else {
      for (const filename of ['.node-version', '.nvmrc'] as const) {
        try {
          const val = await fs.promises.readFile(
            path.join(workPath, filename),
            'utf-8'
          );
          const trimmed = val.trim();
          if (trimmed) {
            runtimeVersion.requested = trimmed;
            runtimeVersion.requestedSource = filename;
            break;
          }
        } catch {
          // file not present, try next
        }
      }
    }

    const manifest: PackageManifest = {
      version: MANIFEST_VERSION,
      runtime: 'node',
      ...(framework ? { framework } : {}),
      runtimeVersion,
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
