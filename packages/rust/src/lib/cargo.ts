import { readFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parse as tomlParse } from 'smol-toml';
import execa from 'execa';
import { debug, normalizePath } from '@vercel/build-utils';

export interface CargoMetadataRoot {
  packages: CargoPackage[];
  workspace_members: string[];
  /** Cargo >= 1.71. Absent on older toolchains. */
  workspace_default_members?: string[];
  resolve: CargoResolve;
  target_directory: string;
  version: number;
  workspace_root: string;
  metadata: CargoMetadata;
}

export interface CargoPackage {
  name: string;
  version: string;
  id: string;
  license: string;
  license_file: string;
  description: string;
  source: string | null;
  dependencies: CargoDependency[];
  targets: CargoTarget[];
  features: CargoFeatures;
  manifest_path: string;
  metadata: CargoDocsMetadata;
  publish: string[];
  authors: string[];
  categories: string[];
  default_run: string | null;
  rust_version: string;
  keywords: string[];
  readme: string;
  repository: string;
  homepage: string;
  documentation: string;
  edition: string;
  links: unknown;
}

interface CargoDependency {
  name: string;
  source: string;
  req: string;
  kind: null | 'dev' | 'build';
  rename: unknown;
  optional: boolean;
  uses_default_features: boolean;
  features: unknown[];
  target: string;
  path: string;
  registry: unknown;
}

interface CargoTarget {
  kind: string[];
  crate_types: string[];
  name: string;
  src_path: string;
  edition: string;
  'required-features': string[];
  doc: boolean;
  doctest: boolean;
  test: boolean;
}

interface CargoFeatures {
  default: string[];
  feat1: unknown[];
  feat2: unknown[];
}

interface CargoDocsMetadata {
  docs: CargoDocs;
}

interface CargoDocs {
  rs: Rs;
}

interface Rs {
  'all-features': boolean;
}

interface CargoResolve {
  nodes: Node[];
  root: string | null;
}

interface Node {
  id: string;
  dependencies: string[];
  deps: Dep[];
  features: string[];
}

interface Dep {
  name: string;
  pkg: string;
  dep_kinds: DepKind[];
}

interface DepKind {
  kind: null | 'dev' | 'build';
  target: string | null;
}

interface CargoMetadata {
  docs: Docs2;
}

interface Docs2 {
  rs: Rs2;
}

interface Rs2 {
  'all-features': boolean;
}

export async function getCargoMetadata(
  options: execa.Options,
  filterPlatform?: string
): Promise<CargoMetadataRoot> {
  const args = ['metadata', '--format-version', '1'];
  if (filterPlatform) args.push('--filter-platform', filterPlatform);
  const { stdout: cargoMetaData } = await execa('cargo', args, options);
  return JSON.parse(cargoMetaData) as CargoMetadataRoot;
}

interface CargoConfig {
  env: Record<string, any>;
  cwd: string;
}

interface CargoBuildTarget {
  name?: string;
  path?: string;
}

interface CargoTomlDependencySpec {
  package?: string;
  optional?: boolean;
}

type CargoTomlDependencies = Record<
  string,
  string | CargoTomlDependencySpec | undefined
>;

export interface CargoToml {
  package?: Record<string, unknown>;
  bin?: CargoBuildTarget[];
  dependencies?: CargoTomlDependencies;
  workspace?: { dependencies?: CargoTomlDependencies };
  target?: Record<string, { dependencies?: CargoTomlDependencies } | undefined>;
}

interface CargoWorkspace {
  toml: CargoToml;
  root: string;
}

export async function findCargoWorkspace(
  config: CargoConfig
): Promise<CargoWorkspace> {
  const { stdout: projectDescriptionStr } = await execa(
    'cargo',
    ['locate-project'],
    config
  );
  const projectDescription = JSON.parse(projectDescriptionStr) as {
    root: string;
  };
  return {
    toml: tomlParse(await readFile(projectDescription.root, 'utf8')),
    root: projectDescription.root,
  };
}

interface CargoBuildConfiguration {
  build: {
    target?: string;
    'target-dir'?: string;
  };
  target: Record<
    string,
    {
      linker?: string;
    }
  >;
}

export async function findCargoBuildConfiguration(
  workspace: CargoWorkspace
): Promise<CargoBuildConfiguration | null> {
  const configPath = path.join(
    path.dirname(workspace.root),
    '.cargo/config.toml'
  );

  if (!existsSync(configPath)) {
    return null;
  }

  const config = tomlParse(await readFile(configPath, 'utf8'));
  return config as unknown as CargoBuildConfiguration;
}

const VERCEL_RUNTIME_CRATE = 'vercel_runtime';
const CARGO_MANIFEST = 'Cargo.toml';

function normalizeCrateName(name: string): string {
  return name.trim().toLowerCase().replace(/-/g, '_');
}

function declaresVercelRuntime(deps?: CargoTomlDependencies): boolean {
  if (!deps) return false;

  for (const [name, spec] of Object.entries(deps)) {
    if (spec && typeof spec === 'object' && spec.optional === true) {
      continue;
    }
    if (normalizeCrateName(name) === VERCEL_RUNTIME_CRATE) return true;
    // Renamed dependency: `my_alias = { package = "vercel_runtime" }`
    if (
      spec &&
      typeof spec === 'object' &&
      typeof spec.package === 'string' &&
      normalizeCrateName(spec.package) === VERCEL_RUNTIME_CRATE
    ) {
      return true;
    }
  }

  return false;
}

export function tomlDeclaresVercelRuntime(toml: CargoToml): boolean {
  return declaresVercelRuntime(toml.dependencies);
}

async function readCargoToml(manifestPath: string): Promise<CargoToml | null> {
  try {
    return tomlParse(await readFile(manifestPath, 'utf8')) as CargoToml;
  } catch (err) {
    debug(`Failed to parse ${manifestPath}: ${err}`);
  }
  return null;
}

// This pre-cargo check is only a routing hint for `vercel dev`.
// Build and dev-server startup replace this hint with Cargo's resolved graph.
export async function hasVercelRuntimeDependency(
  workPath: string,
  entrypoint: string
): Promise<boolean> {
  const root = path.resolve(workPath);
  const entryPath = path.resolve(workPath, entrypoint);

  let dir = path.dirname(entryPath);
  for (;;) {
    const manifestPath = path.join(dir, CARGO_MANIFEST);
    if (existsSync(manifestPath)) {
      const toml = await readCargoToml(manifestPath);
      if (toml?.package) {
        const declaresRuntime = tomlDeclaresVercelRuntime(toml);
        if (declaresRuntime) {
          debug(`Found \`${VERCEL_RUNTIME_CRATE}\` in ${manifestPath}`);
        }
        return declaresRuntime;
      }
    }

    if (dir === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return false;
}

export interface ResolvedCargoBinary {
  /** Cargo bin target name, for `--bin`. */
  name: string;
  /** Cargo package ID, when the binary came from metadata. */
  packageId?: string;
  /** Owning package name, for `-p` (needed in workspaces). */
  packageName: string;
  /** Absolute path of the target's source file. */
  srcPath: string;
}

interface CargoBinTarget extends ResolvedCargoBinary {
  packageId: string;
  isDefaultPackage: boolean;
}

// `resolve.root` is null for virtual workspace manifests, so fall back through
// the other ways cargo identifies the package it would build by default.
function findDefaultPackage(
  metadata: CargoMetadataRoot
): CargoPackage | undefined {
  const defaultMembers = metadata.workspace_default_members;
  if (defaultMembers?.length === 1) {
    const member = metadata.packages.find(p => p.id === defaultMembers[0]);
    if (member) return member;
  }

  const root = metadata.packages.find(p => p.id === metadata.resolve?.root);
  if (root) return root;

  if (metadata.workspace_root) {
    const manifestPath = path.join(metadata.workspace_root, 'Cargo.toml');
    const atRoot = metadata.packages.find(
      p => path.resolve(p.manifest_path) === path.resolve(manifestPath)
    );
    if (atRoot) return atRoot;
  }

  return metadata.packages.length === 1 ? metadata.packages[0] : undefined;
}

// Workspace members only; registry dependencies also appear in `packages` when
// metadata is resolved with dependencies.
function collectBinTargets(metadata: CargoMetadataRoot): CargoBinTarget[] {
  const workspaceIds = new Set(metadata.workspace_members ?? []);
  const defaultPackage = findDefaultPackage(metadata);

  const members = metadata.packages.filter(
    pkg => workspaceIds.size === 0 || workspaceIds.has(pkg.id)
  );

  return members.flatMap(pkg =>
    (pkg.targets ?? [])
      .filter(target => target.kind.includes('bin'))
      .map(target => ({
        name: target.name,
        packageId: pkg.id,
        packageName: pkg.name,
        srcPath: target.src_path,
        isDefaultPackage: pkg.id === defaultPackage?.id,
      }))
  );
}

function looksLikeBinName(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('.')
  );
}

// `cargo metadata` reports canonical paths, so comparing against a path that
// traverses a symlink (e.g. macOS `/var` -> `/private/var`) would never match.
export function realPath(value: string): string {
  try {
    return realpathSync.native(path.resolve(value));
  } catch {
    return path.resolve(value);
  }
}

// Only qualify with the package name when candidates span multiple packages,
// otherwise `app:server` is noise for the common single-crate project.
function describeCandidates(targets: CargoBinTarget[]): string {
  const packages = new Set(targets.map(target => target.packageName));
  return targets
    .map(target =>
      packages.size > 1 ? `${target.packageName}:${target.name}` : target.name
    )
    .join(', ');
}

/**
 * Resolve which cargo binary to build for standalone mode.
 *
 * The entrypoint may be a source path (`src/bin/server.rs`) or a bare cargo bin
 * name (`server`). When it identifies neither, fall back to the default
 * package's `default-run`, then to its only binary.
 */
export function resolveStandaloneBinary(
  metadata: CargoMetadataRoot,
  entrypoint: string | undefined,
  workPath: string
): ResolvedCargoBinary {
  const binTargets = collectBinTargets(metadata);

  if (binTargets.length === 0) {
    throw new Error(
      'No binary target found in this Cargo project. Add a `src/main.rs` or a `[[bin]]` target to your `Cargo.toml`.'
    );
  }

  if (entrypoint) {
    if (!looksLikeBinName(entrypoint)) {
      const entryPath = path.resolve(workPath, entrypoint);
      const resolvedEntry = realPath(entryPath);
      const bySrcPath = binTargets.filter(
        target => realPath(target.srcPath) === resolvedEntry
      );
      if (bySrcPath.length === 1) return bySrcPath[0];
      if (bySrcPath.length > 1) {
        throw new Error(
          `The entrypoint \`${entrypoint}\` matches multiple binary targets (${describeCandidates(bySrcPath)}). Give the targets unique source paths.`
        );
      }
      // Framework presets may supply a conventional path that is absent for a
      // valid custom-bin project. Only an existing, explicit path is binding.
      if (existsSync(entryPath)) {
        throw new Error(
          `The entrypoint \`${entrypoint}\` exists but is not a Cargo binary target. Point it at a binary target declared by this project (${describeCandidates(binTargets)}).`
        );
      }
    } else {
      const byName = binTargets.filter(target => target.name === entrypoint);
      if (byName.length === 1) return byName[0];
      if (byName.length > 1) {
        throw new Error(
          `The binary name \`${entrypoint}\` is ambiguous (${describeCandidates(byName)}). Set the entrypoint to the binary's source path.`
        );
      }
      throw new Error(
        `No Cargo binary target named \`${entrypoint}\` was found. Available targets: ${describeCandidates(binTargets)}.`
      );
    }
  }

  const defaultTargets = binTargets.filter(target => target.isDefaultPackage);
  const candidates = defaultTargets.length > 0 ? defaultTargets : binTargets;

  const defaultPackage = findDefaultPackage(metadata);
  if (defaultPackage?.default_run) {
    const byDefaultRun = candidates.find(
      target => target.name === defaultPackage.default_run
    );
    if (byDefaultRun) return byDefaultRun;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  throw new Error(
    `Unable to determine which binary to deploy. This Cargo project declares multiple binary targets (${describeCandidates(candidates)}). ` +
      'Set the entrypoint to the binary you want to deploy — either its source path (e.g. `src/bin/server.rs`) or its name (e.g. `server`) — or set `default-run` in your `Cargo.toml`.'
  );
}

/** Whether the selected package resolves `vercel_runtime` as a normal dep. */
export function resolvedPackageUsesVercelRuntime(
  metadata: CargoMetadataRoot,
  binary: ResolvedCargoBinary
): boolean {
  const owner = metadata.packages.find(
    pkg =>
      pkg.id === binary.packageId ||
      (pkg.name === binary.packageName &&
        pkg.targets.some(
          target => realPath(target.src_path) === realPath(binary.srcPath)
        ))
  );
  if (!owner) return false;

  const node = metadata.resolve.nodes.find(
    candidate => candidate.id === owner.id
  );
  if (!node) return false;

  return node.deps.some(dep => {
    const resolved = metadata.packages.find(pkg => pkg.id === dep.pkg);
    return (
      resolved !== undefined &&
      normalizeCrateName(resolved.name) === VERCEL_RUNTIME_CRATE &&
      dep.dep_kinds.some(kind => kind.kind === null)
    );
  });
}

/**
 * Guard against running a `vercel_runtime` binary behind the standalone proxy,
 * which cannot work: the binary speaks the runtime protocol, not plain HTTP on
 * `$PORT`. The pre-cargo manifest walk in `hasVercelRuntimeDependency` can only
 * follow the entrypoint's path, so once cargo has attributed the binary to a
 * package, re-check that package's resolved dependencies.
 */
export function assertStandaloneBinary(
  metadata: CargoMetadataRoot,
  binary: ResolvedCargoBinary,
  workPath: string
): void {
  if (!resolvedPackageUsesVercelRuntime(metadata, binary)) return;

  // Entrypoints are written with forward slashes on every platform.
  const srcPath = normalizePath(
    path.relative(realPath(workPath), realPath(binary.srcPath))
  );
  throw new Error(
    `The package \`${binary.packageName}\` depends on \`${VERCEL_RUNTIME_CRATE}\`, so its binary \`${binary.name}\` cannot be deployed as a standalone server. ` +
      `Set the entrypoint to the binary's source file (\`${srcPath}\`) to keep the \`${VERCEL_RUNTIME_CRATE}\` output.`
  );
}

export function findBinaryName(
  workspace: CargoWorkspace,
  entryPath: string
): string {
  const { bin } = workspace.toml;
  if (bin) {
    // Cargo.toml `bin.path` values use forward slashes; match them on Windows.
    const relativePath = normalizePath(
      path.relative(path.dirname(workspace.root), entryPath)
    );
    const entry = bin.find(
      binEntry => binEntry.path && normalizePath(binEntry.path) === relativePath
    );
    if (entry?.name) {
      return entry.name;
    }
  }

  return path.basename(entryPath, '.rs').replace('[', '_').replace(']', '_');
}
