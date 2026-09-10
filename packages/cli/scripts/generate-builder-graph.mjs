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
import { dirname, isAbsolute, join, resolve } from 'node:path';
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
export async function indexWorkspaceTarballs(
  specs,
  packagesDir = defaultPackagesDir
) {
  const remoteEntries = Object.entries(specs).filter(([, spec]) =>
    isRemoteSpec(spec)
  );
  if (remoteEntries.length === 0) return new Map();
  const tarballBaseUrls = new Set(
    remoteEntries.map(([name, spec]) => {
      const suffix = `/${previewTarballFilename(name)}`;
      if (!spec.endsWith(suffix)) {
        throw new Error(
          `Unexpected workspace tarball URL for ${name}: ${spec}`
        );
      }
      return spec.slice(0, -suffix.length);
    })
  );

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
    const artifact = {
      name: packageJson.name,
      path,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    };
    for (const baseUrl of tarballBaseUrls) {
      const url = `${baseUrl}/${previewTarballFilename(packageJson.name)}`;
      artifacts.set(url, artifact);
    }
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
  return {
    name: pkg.packageJson.name,
    version: pkg.packageJson.version,
    path,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
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
    artifacts.set(registryTarballUrl(name, version), artifact);
  }
  return artifacts;
}

export class LocalPreviewPackageInfoClient extends PackageInfoClient {
  constructor(options, artifacts, remoteSpecs = new Map(), downloadArtifact) {
    super(options);
    this.artifacts = artifacts;
    this.remoteSpecs = remoteSpecs;
    this.downloadArtifact = downloadArtifact;
  }

  artifact(spec) {
    const finalUrl = specTarballUrl(spec);
    if (finalUrl) {
      const artifact = this.artifacts.get(finalUrl);
      if (artifact) return { artifact, finalUrl };
    }

    const name = specName(spec);
    const version = specVersion(spec);
    if (name && version) {
      const url = registryTarballUrl(name, version);
      const artifact = this.artifacts.get(url);
      if (artifact) return { artifact, finalUrl: url };
    }

    if (!name) return undefined;
    for (const [url, artifact] of this.artifacts) {
      if (artifact.name !== name) continue;
      if (version && artifact.version && artifact.version !== version) continue;
      return { artifact, finalUrl: url };
    }
    return undefined;
  }

  async local(spec) {
    const existing = this.artifact(spec);
    if (existing) return existing;
    if (!this.downloadArtifact) return undefined;

    const finalUrl = specTarballUrl(spec);
    const name =
      specName(spec) ?? (finalUrl ? this.remoteSpecs.get(finalUrl) : undefined);
    if (!finalUrl || !name) return undefined;

    const artifact = await this.downloadArtifact(name, finalUrl);
    this.artifacts.set(finalUrl, artifact);
    return { artifact, finalUrl };
  }

  async manifest(spec, options) {
    const local = await this.local(spec);
    if (!local) return super.manifest(spec, options);
    const { artifact, finalUrl } = local;
    const localUrl = pathToFileURL(await realpath(artifact.path)).href;
    const manifest = await super.manifest(
      `${artifact.name}@${localUrl}`,
      options
    );
    return {
      ...manifest,
      dist: {
        ...manifest.dist,
        tarball: finalUrl,
        integrity: artifact.integrity,
      },
    };
  }

  async resolve(spec, options) {
    const local = await this.local(spec);
    if (!local) return super.resolve(spec, options);
    const resolution = await super.resolve(
      `${local.artifact.name}@${local.finalUrl}`,
      options
    );
    return { ...resolution, integrity: local.artifact.integrity };
  }

  async tarball(spec, options) {
    const local = await this.local(spec);
    if (!local) return super.tarball(spec, options);
    return readFile(local.artifact.path);
  }

  async extract(spec, target, options) {
    const local = await this.local(spec);
    if (!local) return super.extract(spec, target, options);
    const localUrl = pathToFileURL(await realpath(local.artifact.path)).href;
    await super.extract(`${local.artifact.name}@${localUrl}`, target, options);
    const resolution = await super.resolve(
      `${local.artifact.name}@${local.finalUrl}`,
      options
    );
    return { ...resolution, integrity: local.artifact.integrity };
  }
}

async function generateOneBuilderGraph({
  name,
  spec,
  buildUtilsSpec,
  artifacts,
  remoteSpecs,
  downloadArtifact,
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
      remoteSpecs,
      downloadArtifact
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
  const remoteSpecs = new Map(
    Object.entries(allSpecs)
      .filter(([, spec]) => isRemoteSpec(spec))
      .map(([name, spec]) => [spec, name])
  );
  const downloadRoot = await mkdtemp(
    join(tmpdir(), 'vercel-builder-tarballs-')
  );
  if (!providedArtifacts) {
    const unpublished = await packUnpublishedWorkspaceArtifacts(
      allSpecs,
      packagesDir,
      downloadRoot,
      hasVersion ?? registryHasVersion
    );
    for (const [url, artifact] of unpublished) {
      artifacts.set(url, artifact);
    }
  }
  const downloads = new Map();
  const downloadArtifact = (name, url) => {
    let download = downloads.get(url);
    if (!download) {
      download = (async () => {
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
          name,
          path,
          integrity: `sha512-${createHash('sha512')
            .update(bytes)
            .digest('base64')}`,
        };
      })();
      downloads.set(url, download);
    }
    return download;
  };

  const missingLocalArtifacts = Object.values(allSpecs).filter(
    spec => isRemoteSpec(spec) && !artifacts.has(spec)
  );
  // A live URL is valid for native binary builds. During preview package
  // packing all same-deployment URLs should have local artifacts, and callers
  // can request strict validation once the artifact index is known.
  if (providedArtifacts && missingLocalArtifacts.length > 0) {
    throw new Error(
      `Missing local workspace tarballs for: ${missingLocalArtifacts.join(', ')}`
    );
  }

  try {
    const entries = await Promise.all(
      Object.entries(builders).map(([name, spec]) =>
        generateOneBuilderGraph({
          name,
          spec,
          buildUtilsSpec,
          artifacts,
          remoteSpecs,
          downloadArtifact,
        })
      )
    );
    return {
      schemaVersion: 1,
      builders: Object.fromEntries(entries.map(entry => [entry.name, entry])),
    };
  } finally {
    await rm(downloadRoot, { recursive: true, force: true });
  }
}
