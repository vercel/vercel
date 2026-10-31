import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { install } from '@vltpkg/graph';
import { PackageInfoClient } from '@vltpkg/package-info';
import { PackageJson } from '@vltpkg/package-json';
import { PathScurry } from 'path-scurry';
import { previewTarballFilename } from './pin-builders.mjs';

const REGISTRY = 'https://registry.npmjs.org/';
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/;
const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultPackagesDir = resolve(cliRoot, '..');
const compress = promisify(brotliCompress);
const execFileAsync = promisify(execFile);

// This code-unit ordering must remain byte-identical to canonicalize() in
// vlt-builder-importer.ts, which verifies hashes generated here on user machines.
function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareKeys(a, b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function hashBuilderGraph(graph) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(graph)))
    .digest('hex');
}

function stripNonSemanticManifestMetadata(value) {
  if (Array.isArray(value)) return value.map(stripNonSemanticManifestMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '_from' && key !== '_resolved')
      .map(([key, child]) => [key, stripNonSemanticManifestMetadata(child)])
  );
}

function isRemoteSpec(spec) {
  return /^https?:\/\//.test(spec);
}

function isExactVersionSpec(spec) {
  return EXACT_VERSION.test(spec);
}

export function registryTarballUrl(name, version) {
  const unscoped = name.startsWith('@') ? name.split('/').pop() : name;
  return `${REGISTRY}${name}/-/${unscoped}-${version}.tgz`;
}

function isRegistryTarballUrl(url) {
  return typeof url === 'string' && url.startsWith(REGISTRY);
}

function artifactTarballUrl(artifact, url) {
  return isRegistryTarballUrl(url) &&
    artifact.sourceUrl &&
    !isRegistryTarballUrl(artifact.sourceUrl)
    ? artifact.sourceUrl
    : url;
}

function artifactIntegrity(artifact, url) {
  return !isRegistryTarballUrl(url) || artifact.sourceUrl === url
    ? artifact.integrity
    : undefined;
}

function registryManifestUrl(name, version) {
  return `${REGISTRY}${name.replace('/', '%2f')}/${version}`;
}

export async function registryHasVersion(name, version) {
  const response = await fetch(registryManifestUrl(name, version), {
    headers: { accept: 'application/json' },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Could not check ${name}@${version} on npm: ${response.status}`
    );
  }
  return true;
}

function specName(spec) {
  if (spec && typeof spec === 'object') {
    return spec.name ?? spec.final?.name;
  }
  const value = String(spec);
  if (value.startsWith('@')) {
    const at = value.indexOf('@', 1);
    return at === -1 ? value : value.slice(0, at);
  }
  const at = value.indexOf('@');
  return at === -1 ? value : value.slice(0, at);
}

function specVersion(spec) {
  if (spec && typeof spec === 'object') {
    const version = spec.bareSpec ?? spec.semver ?? spec.final?.semver;
    return typeof version === 'string' && isExactVersionSpec(version)
      ? version
      : undefined;
  }
  const name = specName(spec);
  if (!name) return undefined;
  const value = String(spec);
  if (!value.startsWith(`${name}@`)) return undefined;
  const version = value.slice(name.length + 1);
  return isExactVersionSpec(version) ? version : undefined;
}

function specTarballUrl(spec) {
  if (spec && typeof spec === 'object') {
    return (
      spec.final?.remoteURL ??
      spec.conventionalRegistryTarball ??
      spec.remoteURL
    );
  }
  return String(spec).match(/https?:\/\/.+$/)?.[0];
}

/**
 * Indexes the tarballs already produced by utils/pack.ts. Their package
 * manifests refer to the future preview deployment URLs, but the bytes are
 * available locally before that deployment is live.
 */
async function readPackageTarballManifest(expectedName, path) {
  const packageInfo = new PackageInfoClient({
    packageJson: new PackageJson(),
    projectRoot: dirname(path),
  });
  return packageInfo.manifest(`${expectedName}@file:${basename(path)}`);
}

async function createPackageArtifact(expectedName, path, bytes, sourceUrl) {
  const manifest = await readPackageTarballManifest(expectedName, path);
  if (manifest.name !== expectedName) {
    throw new Error(
      `Packed artifact ${path} contains ${String(manifest.name)} instead of ${expectedName}`
    );
  }
  if (!isExactVersionSpec(manifest.version)) {
    throw new Error(
      `Packed artifact ${path} has invalid version ${String(manifest.version)}`
    );
  }
  return {
    name: expectedName,
    packageName: manifest.name,
    version: manifest.version,
    manifest,
    path,
    sourceUrl,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
}

async function downloadRemoteArtifacts(specs, artifacts, downloadRoot) {
  const pending = new Map();
  const visited = new Set();
  const enqueueDependencies = artifact => {
    for (const field of RUNTIME_DEP_FIELDS) {
      for (const [dependencyName, spec] of Object.entries(
        artifact.manifest[field] ?? {}
      )) {
        if (isRemoteSpec(spec) && !artifacts.has(spec) && !visited.has(spec)) {
          pending.set(spec, dependencyName);
        }
      }
    }
  };
  for (const [name, spec] of Object.entries(specs)) {
    if (!isRemoteSpec(spec)) continue;
    const artifact = artifacts.get(spec);
    if (artifact) enqueueDependencies(artifact);
    else pending.set(spec, name);
  }

  while (pending.size > 0) {
    const batch = [...pending];
    pending.clear();
    const results = await Promise.allSettled(
      batch.map(async ([url, name]) => {
        visited.add(url);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Could not download ${name} from ${url}: ${response.status}`
          );
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        const path = join(
          downloadRoot,
          `${createHash('sha256').update(url).digest('hex')}.tgz`
        );
        await writeFile(path, bytes);
        return {
          url,
          artifact: await createPackageArtifact(name, path, bytes, url),
        };
      })
    );
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;

    for (const { value } of results) {
      const { url, artifact } = value;
      artifacts.set(url, artifact);
      artifacts.set(
        registryTarballUrl(artifact.packageName, artifact.version),
        artifact
      );
      enqueueDependencies(artifact);
    }
  }
}

export async function indexWorkspaceTarballs(
  specs,
  packagesDir = defaultPackagesDir
) {
  const remoteEntries = Object.entries(specs).filter(
    ([, spec]) => isRemoteSpec(spec) && !isRegistryTarballUrl(spec)
  );
  if (remoteEntries.length === 0) return new Map();
  const remoteUrls = new Map(remoteEntries);
  for (const [name, spec] of remoteUrls) {
    if (!spec.endsWith(`/${previewTarballFilename(name)}`)) {
      throw new Error(`Unexpected workspace tarball URL for ${name}: ${spec}`);
    }
  }

  const artifacts = new Map();
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = join(packagesDir, entry.name);
    let packageJson;
    let files;
    try {
      [packageJson, files] = await Promise.all([
        readFile(join(packageDir, 'package.json'), 'utf8').then(JSON.parse),
        readdir(packageDir),
      ]);
    } catch {
      continue;
    }
    if (!packageJson.name) continue;
    const tarball = files.find(file => /^vercel-.+\.tgz$/.test(file));
    if (!tarball) continue;
    const path = join(packageDir, tarball);
    const bytes = await readFile(path);
    const remoteUrl = remoteUrls.get(packageJson.name);
    const artifact = await createPackageArtifact(
      packageJson.name,
      path,
      bytes,
      remoteUrl
    );
    artifacts.set(
      registryTarballUrl(artifact.packageName, artifact.version),
      artifact
    );
    if (remoteUrl) artifacts.set(remoteUrl, artifact);
  }

  return artifacts;
}

const WORKSPACE_SPEC = /^workspace:/;
const RUNTIME_DEP_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
];
export const pnpmCommand = 'pnpm';

export function pnpmExecOptions() {
  return process.platform === 'win32' ? { shell: true } : {};
}

async function readWorkspacePackages(packagesDir) {
  const packages = new Map();
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = join(packagesDir, entry.name);
    try {
      const packageJson = JSON.parse(
        await readFile(join(packageDir, 'package.json'), 'utf8')
      );
      if (packageJson.name && packageJson.version) {
        packages.set(packageJson.name, { dir: packageDir, packageJson });
      }
    } catch {}
  }
  return packages;
}

function collectWorkspaceClosure(rootNames, workspacePackages) {
  const needed = new Set();
  const queue = [...rootNames];
  while (queue.length > 0) {
    const name = queue.pop();
    if (needed.has(name)) continue;
    const pkg = workspacePackages.get(name);
    if (!pkg) continue;
    needed.add(name);
    for (const field of RUNTIME_DEP_FIELDS) {
      for (const [depName, depSpec] of Object.entries(
        pkg.packageJson[field] ?? {}
      )) {
        if (WORKSPACE_SPEC.test(depSpec)) {
          queue.push(depName);
        }
      }
    }
  }
  return needed;
}

function parsePnpmPackFilename(stdout) {
  const fallback = stdout.trim().split(/\r?\n/).at(-1)?.trim();
  if (fallback?.endsWith('.tgz')) return fallback;
  throw new Error(`pnpm pack did not report a tarball: ${stdout.trim()}`);
}

async function packWorkspacePackage(pkg, destDir) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      pnpmCommand,
      ['pack', '--pack-destination', destDir],
      {
        cwd: pkg.dir,
        maxBuffer: 10 * 1024 * 1024,
        ...pnpmExecOptions(),
      }
    ));
  } catch (error) {
    const details = [error.stderr, error.stdout]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(
      `pnpm pack failed for ${pkg.packageJson.name}: ${details || error.message}`
    );
  }
  const packedName = parsePnpmPackFilename(stdout);
  const path = isAbsolute(packedName) ? packedName : join(destDir, packedName);
  const bytes = await readFile(path);
  return createPackageArtifact(pkg.packageJson.name, path, bytes);
}

export async function packUnpublishedWorkspaceArtifacts(
  specs,
  packagesDir = defaultPackagesDir,
  destDir,
  hasVersion
) {
  const workspacePackages = await readWorkspacePackages(packagesDir);
  const roots = Object.entries(specs).flatMap(([name, spec]) => {
    if (!isExactVersionSpec(spec)) return [];
    const pkg = workspacePackages.get(name);
    return pkg?.packageJson.version === spec ? [name] : [];
  });
  if (roots.length === 0) return new Map();

  const artifacts = new Map();
  for (const name of collectWorkspaceClosure(roots, workspacePackages)) {
    const pkg = workspacePackages.get(name);
    const version = pkg.packageJson.version;
    if (hasVersion ? await hasVersion(name, version) : false) continue;
    const artifact = await packWorkspacePackage(pkg, destDir);
    artifacts.set(
      registryTarballUrl(artifact.packageName, artifact.version),
      artifact
    );
  }
  return artifacts;
}

export class LocalPreviewPackageInfoClient extends PackageInfoClient {
  constructor(
    options,
    artifacts,
    operations = new Set(),
    operationErrors = []
  ) {
    super(options);
    this.artifacts = artifacts;
    this.operations = operations;
    this.operationErrors = operationErrors;
  }

  track(operation) {
    this.operations.add(operation);
    operation.then(
      () => this.operations.delete(operation),
      error => {
        this.operations.delete(operation);
        this.operationErrors.push(error);
      }
    );
    return operation;
  }

  artifact(spec) {
    const finalUrl = specTarballUrl(spec);
    if (finalUrl) {
      const artifact = this.artifacts.get(finalUrl);
      if (artifact) {
        return { artifact, finalUrl: artifactTarballUrl(artifact, finalUrl) };
      }
    }

    const name = specName(spec);
    const version = specVersion(spec);
    if (name && version) {
      const url = registryTarballUrl(name, version);
      const artifact = this.artifacts.get(url);
      if (artifact) {
        return { artifact, finalUrl: artifactTarballUrl(artifact, url) };
      }
    }

    return undefined;
  }

  async validateVersion(spec, artifact) {
    const expectedVersion = specVersion(spec);
    if (!expectedVersion) return undefined;
    const localUrl = pathToFileURL(await realpath(artifact.path)).href;
    const manifest = await super.manifest(`${artifact.name}@${localUrl}`);
    if (manifest.version !== expectedVersion) {
      throw new Error(
        `Resolved ${String(spec)} to ${String(manifest.name)}@${String(manifest.version)} instead of ${expectedVersion}`
      );
    }
    artifact.packageName = manifest.name;
    artifact.version = manifest.version;
    return manifest;
  }

  async local(spec) {
    const existing = this.artifact(spec);
    if (!existing) return undefined;
    const manifest = await this.validateVersion(spec, existing.artifact);
    return { ...existing, manifest };
  }

  manifest(spec, options) {
    return this.track(this.manifestLocal(spec, options));
  }

  async manifestLocal(spec, options) {
    const local = await this.local(spec);
    if (!local) return super.manifest(spec, options);
    const { artifact, finalUrl } = local;
    const manifest =
      local.manifest ??
      (await super.manifest(
        `${artifact.name}@${pathToFileURL(await realpath(artifact.path)).href}`,
        options
      ));
    const integrity = artifactIntegrity(artifact, finalUrl);
    return {
      ...manifest,
      dist: {
        ...manifest.dist,
        tarball: finalUrl,
        ...(integrity ? { integrity } : {}),
      },
    };
  }

  resolve(spec, options) {
    return this.track(this.resolveLocal(spec, options));
  }

  async resolveLocal(spec, options) {
    const local = await this.local(spec);
    if (!local) return super.resolve(spec, options);
    const resolution = await super.resolve(
      `${local.artifact.name}@${local.finalUrl}`,
      options
    );
    const integrity = artifactIntegrity(local.artifact, local.finalUrl);
    return integrity ? { ...resolution, integrity } : resolution;
  }

  tarball(spec, options) {
    return this.track(this.tarballLocal(spec, options));
  }

  async tarballLocal(spec, options) {
    const local = await this.local(spec);
    if (!local) return super.tarball(spec, options);
    return readFile(local.artifact.path);
  }

  extract(spec, target, options) {
    return this.track(this.extractLocal(spec, target, options));
  }

  async extractLocal(spec, target, options) {
    const local = await this.local(spec);
    if (!local) return super.extract(spec, target, options);
    const localUrl = pathToFileURL(await realpath(local.artifact.path)).href;
    await super.extract(`${local.artifact.name}@${localUrl}`, target, options);
    const resolution = await super.resolve(
      `${local.artifact.name}@${local.finalUrl}`,
      options
    );
    const integrity = artifactIntegrity(local.artifact, local.finalUrl);
    return integrity ? { ...resolution, integrity } : resolution;
  }
}

async function settleOperations(operations) {
  while (operations.size > 0) {
    await Promise.allSettled([...operations]);
  }
}

async function generateOneBuilderGraph({
  name,
  spec,
  buildUtilsSpec,
  artifacts,
  operations,
  operationErrors,
}) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'vercel-builder-graph-'));
  const manifest = {
    name: 'vercel-pinned-builder',
    private: true,
    dependencies: {
      [name]: spec,
      '@vercel/build-utils': buildUtilsSpec,
    },
  };
  const options = {
    projectRoot,
    registry: REGISTRY,
    registries: { npm: REGISTRY },
  };

  try {
    await writeFile(
      join(projectRoot, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    const packageJson = new PackageJson();
    const packageInfo = new LocalPreviewPackageInfoClient(
      { ...options, packageJson },
      artifacts,
      operations,
      operationErrors
    );
    const builderManifest = await packageInfo.manifest(`${name}@${spec}`);
    const { graph } = await install({
      ...options,
      packageInfo,
      packageJson,
      scurry: new PathScurry(projectRoot),
      allowScripts: ':not(*)',
      lockfileOnly: true,
    });
    const contents = {
      name,
      version: builderManifest.version,
      manifest,
      lockfile: stripNonSemanticManifestMetadata(graph.toJSON()),
    };
    return { hash: hashBuilderGraph(contents), ...contents };
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

/**
 * Writes each Builder's graph hash and version. Importing an installed
 * Builder only needs this, not the full compressed graphs.
 */
export async function writeBuilderIndex(path, graphs) {
  const builders = Object.fromEntries(
    Object.entries(graphs.builders).map(([name, { hash, version }]) => [
      name,
      { hash, version },
    ])
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ schemaVersion: 1, builders })}\n`);
}

export async function writeCompressedBuilderGraphs(path, graphs) {
  const compressed = await compress(Buffer.from(JSON.stringify(graphs)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, compressed);
}

/**
 * @param {Record<string, string>} builders
 * @param {{
 *   buildUtilsSpec?: string,
 *   packagesDir?: string,
 *   artifacts?: Map<string, { name: string, path: string, integrity: string }>,
 *   hasVersion?: (name: string, version: string) => Promise<boolean>
 * }} options
 */
export async function generateBuilderGraphs(
  builders,
  {
    buildUtilsSpec,
    packagesDir = defaultPackagesDir,
    artifacts: providedArtifacts,
    hasVersion,
  } = {}
) {
  if (!buildUtilsSpec) {
    throw new Error(
      'Cannot generate Builder graphs without @vercel/build-utils'
    );
  }
  const allSpecs = { ...builders, '@vercel/build-utils': buildUtilsSpec };
  const artifacts =
    providedArtifacts ?? (await indexWorkspaceTarballs(allSpecs, packagesDir));
  const downloadRoot = await mkdtemp(
    join(tmpdir(), 'vercel-builder-tarballs-')
  );
  const operations = new Set();
  const operationErrors = [];

  try {
    if (providedArtifacts) {
      const missingArtifacts = Object.values(allSpecs).filter(
        spec => isRemoteSpec(spec) && !artifacts.has(spec)
      );
      if (missingArtifacts.length > 0) {
        throw new Error(
          `Missing local workspace tarballs for: ${missingArtifacts.join(', ')}`
        );
      }
    } else {
      const unpublished = await packUnpublishedWorkspaceArtifacts(
        allSpecs,
        packagesDir,
        downloadRoot,
        hasVersion ?? registryHasVersion
      );
      for (const [url, artifact] of unpublished) {
        artifacts.set(url, artifact);
      }
      await downloadRemoteArtifacts(allSpecs, artifacts, downloadRoot);
    }

    const results = await Promise.allSettled(
      Object.entries(builders).map(([name, spec]) =>
        generateOneBuilderGraph({
          name,
          spec,
          buildUtilsSpec,
          artifacts,
          operations,
          operationErrors,
        })
      )
    );
    await settleOperations(operations);

    const failedGraph = results.find(result => result.status === 'rejected');
    if (failedGraph) throw failedGraph.reason;
    if (operationErrors.length > 0) throw operationErrors[0];

    const entries = results.map(result => result.value);
    return {
      schemaVersion: 1,
      builders: Object.fromEntries(entries.map(entry => [entry.name, entry])),
    };
  } finally {
    await settleOperations(operations);
    await rm(downloadRoot, { recursive: true, force: true });
  }
}
