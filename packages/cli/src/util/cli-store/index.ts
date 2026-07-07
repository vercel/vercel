/**
 * Managed CLI store (experimental). See README.md in this directory.
 *
 *   ~/.vercel/cli/
 *   ├── versions/
 *   │   ├── npm/54.19.0/      extracted npm tarball, run via node
 *   │   └── native/54.21.0/   platform binary, exec'd directly
 *   └── current.json          { storeFormat, version, type }
 */
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { join, dirname, sep } from 'path';
import { Readable } from 'stream';
import zlib from 'zlib';
import tar from 'tar-fs';
import semver from 'semver';
import {
  existsSync,
  mkdirpSync,
  moveSync,
  readJSONSync,
  removeSync,
  writeJSONSync,
  renameSync,
  chmodSync,
  realpathSync,
} from 'fs-extra';
import output from '../../output-manager';

export const STORE_FORMAT = 1;

export interface StorePointer {
  storeFormat: number;
  version: string;
  type: 'npm' | 'native';
  /** Pinned pointers are only moved by explicit `vc version` commands. */
  pinned?: boolean;
}

export const NATIVE_PACKAGE_SCOPE = '@vercel/vc-native';

export function getNativePlatformPackage(): string {
  return `${NATIVE_PACKAGE_SCOPE}-${process.platform}-${process.arch}`;
}

// Enrolled when the store exists (created by `vc version`).
// VERCEL_CLI_STORE=1 forces on (testing), =0 forces off (bypass).
export function isCliStoreEnabled(): boolean {
  const env = process.env.VERCEL_CLI_STORE;
  if (env === '1') return true;
  if (env === '0') return false;
  return readPointer() !== undefined;
}

export function getStoreRoot(): string {
  return process.env.VERCEL_CLI_STORE_DIR || join(homedir(), '.vercel', 'cli');
}

export function getPointerPath(root: string = getStoreRoot()): string {
  return join(root, 'current.json');
}

export function removeStore(root: string = getStoreRoot()): void {
  removeSync(root);
}

export function getVersionDir(
  version: string,
  root: string = getStoreRoot(),
  type: StorePointer['type'] = 'npm'
): string {
  return join(root, 'versions', type, version);
}

// Missing, malformed, or unrecognized-format pointers all read as "no
// store" so future format changes degrade old installs gracefully.
export function readPointer(
  root: string = getStoreRoot()
): StorePointer | undefined {
  try {
    const pointer = readJSONSync(getPointerPath(root));
    if (
      pointer &&
      pointer.storeFormat === STORE_FORMAT &&
      typeof pointer.version === 'string' &&
      semver.valid(pointer.version) &&
      (pointer.type === 'npm' || pointer.type === 'native')
    ) {
      return pointer as StorePointer;
    }
  } catch (_) {}
  return undefined;
}

// Atomic (tmp + rename). Monotonic for unpinned pointers (racing writers
// are harmless); pinned pointers are never moved except with force, which
// is reserved for explicit `vc version` commands.
export function writePointer(
  pointer: StorePointer,
  root: string = getStoreRoot(),
  opts: { force?: boolean } = {}
): void {
  const existing = readPointer(root);
  if (existing && !opts.force) {
    if (existing.pinned) return;
    if (semver.gte(existing.version, pointer.version)) return;
  }
  const dest = getPointerPath(root);
  mkdirpSync(dirname(dest));
  const tmp = `${dest}.tmp-${process.pid}`;
  writeJSONSync(tmp, pointer);
  renameSync(tmp, dest);
}

// SRI string ("sha512-<base64>") or legacy hex sha1 shasum.
export function verifyIntegrity(
  content: Buffer,
  { integrity, shasum }: { integrity?: string; shasum?: string }
): boolean {
  const bytes = Uint8Array.from(content);
  if (integrity) {
    const dashIndex = integrity.indexOf('-');
    if (dashIndex === -1) return false;
    const algorithm = integrity.slice(0, dashIndex);
    const expected = integrity.slice(dashIndex + 1);
    if (!/^sha(1|256|384|512)$/.test(algorithm)) return false;
    const actual = createHash(algorithm).update(bytes).digest('base64');
    return actual === expected;
  }
  if (shasum) {
    return createHash('sha1').update(bytes).digest('hex') === shasum;
  }
  return false;
}

export async function extractTarball(
  tarball: Buffer,
  destDir: string
): Promise<void> {
  mkdirpSync(destDir);
  await new Promise<void>((resolve, reject) => {
    Readable.from(tarball)
      .pipe(zlib.createGunzip())
      .on('error', reject)
      .pipe(
        tar.extract(destDir, {
          map(header) {
            header.name = header.name.replace(/^package\//, '');
            return header;
          },
        })
      )
      .on('error', reject)
      .on('finish', () => resolve());
  });
}

function getRegistryUrl(): string {
  const fromEnv =
    process.env.VERCEL_NPM_REGISTRY ||
    process.env.npm_config_registry ||
    process.env.NPM_CONFIG_REGISTRY;
  const url = fromEnv || 'https://registry.npmjs.org';
  return url.replace(/\/+$/, '');
}

interface VersionMetadata {
  version: string;
  tarballUrl: string;
  integrity?: string;
  shasum?: string;
}

async function fetchVersionMetadata(
  packageName: string,
  version: string
): Promise<VersionMetadata> {
  const url = `${getRegistryUrl()}/${packageName}/${version}`;
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(
      `Registry lookup failed for ${packageName}@${version}: HTTP ${res.status}`
    );
  }
  const data = (await res.json()) as {
    version?: string;
    dist?: { tarball?: string; integrity?: string; shasum?: string };
  };
  if (!data.version || !data.dist?.tarball) {
    throw new Error(
      `Registry metadata for ${packageName}@${version} is missing dist information`
    );
  }
  return {
    version: data.version,
    tarballUrl: data.dist.tarball,
    integrity: data.dist.integrity,
    shasum: data.dist.shasum,
  };
}

async function downloadTarball(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Tarball download failed: HTTP ${res.status} for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// The published bundle keeps runtime deps external (small tarball), so
// install them into the version dir. npm here is strictly a downloader
// scoped to the staging dir — never global, never the user's project.
function installRuntimeDependencies(stagingDir: string): void {
  const manifestPath = join(stagingDir, 'package.json');
  const manifest = readJSONSync(manifestPath) as Record<string, unknown> & {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const hasRuntimePackages =
    Object.keys(manifest.dependencies ?? {}).length > 0 ||
    Object.keys(manifest.peerDependencies ?? {}).length > 0;
  if (!hasRuntimePackages) {
    return;
  }

  // devDeps reference unpublished @vercel-internals/* packages; npm
  // resolves them even with --omit=dev, so strip them first.
  if (manifest.devDependencies) {
    delete manifest.devDependencies;
    writeJSONSync(manifestPath, manifest);
  }

  // Avoid deadlocking on npm's global install lock when invoked from a
  // global npm context.
  const env = { ...process.env, npm_config_global: undefined };

  try {
    execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      [
        'install',
        '--omit=dev',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
        '--progress=false',
      ],
      { cwd: stagingDir, stdio: 'pipe', windowsHide: true, env }
    );
  } catch (err) {
    throw new Error(describeDependencyInstallError(err));
  }
}

function describeDependencyInstallError(err: unknown): string {
  const stderr =
    err && typeof err === 'object' && 'stderr' in err
      ? String((err as { stderr: unknown }).stderr ?? '')
      : '';
  const message = err instanceof Error ? err.message : String(err);

  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    err.code === 'ENOENT'
  ) {
    return (
      'Could not install the CLI\u2019s dependencies: npm was not found on your PATH. ' +
      'Install npm (it ships with Node.js) and try again.'
    );
  }

  if (/ETARGET|minimum.?release.?age|with a date before/i.test(stderr)) {
    return (
      'Could not install the CLI\u2019s dependencies: your npm minimum release age ' +
      'policy is delaying a recently published package. Retry later, or override ' +
      'for this upgrade with: npm_config_min_release_age=0 vercel upgrade'
    );
  }

  if (
    /E(AI_AGAIN|NOTFOUND|CONNREFUSED|TIMEDOUT)|network|fetch failed/i.test(
      stderr + message
    )
  ) {
    return (
      'Could not install the CLI\u2019s dependencies: a network error occurred while ' +
      'contacting the npm registry. Check your connection or proxy settings and retry.'
    );
  }

  const detail = stderr.trim().split('\n').slice(0, 3).join('\n');
  return `Could not install the CLI\u2019s dependencies.${detail ? `\n${detail}` : ''}`;
}

export interface InstallOptions {
  pinned?: boolean;
  force?: boolean;
}

// Stage + atomic move: a version dir is either complete or absent. A
// concurrent install of the same version is success, not failure.
async function placeNpmPayload(
  tarball: Buffer | undefined,
  versionDir: string
): Promise<string> {
  if (tarball && !existsSync(join(versionDir, 'package.json'))) {
    const stagingDir = `${versionDir}.tmp-${process.pid}`;
    removeSync(stagingDir);
    try {
      await extractTarball(tarball, stagingDir);
      installRuntimeDependencies(stagingDir);
      moveSync(stagingDir, versionDir, { overwrite: false });
    } catch (err) {
      removeSync(stagingDir);
      if (!existsSync(join(versionDir, 'package.json'))) {
        throw err;
      }
    }
  }

  const installed = readJSONSync(join(versionDir, 'package.json')) as {
    version?: string;
  };
  if (!installed.version || !semver.valid(installed.version)) {
    removeSync(versionDir);
    throw new Error(
      `Installed package at ${versionDir} has an invalid version — removed.`
    );
  }
  return installed.version;
}

// Returns the measured version from the extracted package.json, never the
// requested value.
export async function installVersionToStore(
  packageName: string,
  version: string,
  root: string = getStoreRoot(),
  opts: InstallOptions = {}
): Promise<string> {
  const versionDir = getVersionDir(version, root);

  let tarball: Buffer | undefined;
  if (!existsSync(join(versionDir, 'package.json'))) {
    const meta = await fetchVersionMetadata(packageName, version);
    output.debug(`Downloading ${meta.tarballUrl}`);
    tarball = await downloadTarball(meta.tarballUrl);

    if (!verifyIntegrity(tarball, meta)) {
      throw new Error(
        `Integrity verification failed for ${packageName}@${version}. ` +
          `The downloaded tarball does not match the registry's published checksum.`
      );
    }
  }

  const installedVersion = await placeNpmPayload(tarball, versionDir);

  writePointer(
    {
      storeFormat: STORE_FORMAT,
      version: installedVersion,
      type: 'npm',
      ...(opts.pinned ? { pinned: true } : {}),
    },
    root,
    { force: opts.force }
  );
  return installedVersion;
}

// Installs from an arbitrary tarball URL (e.g. a PR build). No registry
// metadata exists for these, so there is no integrity verification; the
// measured package.json version names the store entry. Always pinned.
export async function installTarballUrlToStore(
  url: string,
  root: string = getStoreRoot()
): Promise<string> {
  output.debug(`Downloading ${url}`);
  const tarball = await downloadTarball(url);

  const probeDir = join(root, `probe.tmp-${process.pid}`);
  removeSync(probeDir);
  let version: string;
  try {
    await extractTarball(tarball, probeDir);
    const manifest = readJSONSync(join(probeDir, 'package.json')) as {
      version?: string;
    };
    if (!manifest.version || !semver.valid(manifest.version)) {
      throw new Error(`Tarball at ${url} has an invalid package version.`);
    }
    version = manifest.version;
  } finally {
    removeSync(probeDir);
  }

  const versionDir = getVersionDir(version, root);
  removeSync(versionDir); // same-version re-pins replace the payload
  const installedVersion = await placeNpmPayload(tarball, versionDir);

  writePointer(
    {
      storeFormat: STORE_FORMAT,
      version: installedVersion,
      type: 'npm',
      pinned: true,
    },
    root,
    { force: true }
  );
  return installedVersion;
}

// Binary comes from the platform package, verified, never modified after
// extraction (code signature stays intact).
export async function installNativeVersionToStore(
  version: string,
  root: string = getStoreRoot(),
  opts: InstallOptions = {}
): Promise<string> {
  const platformPackage = getNativePlatformPackage();
  const versionDir = getVersionDir(version, root, 'native');
  const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
  // Must match getStoreEntrypoint.
  const binaryPath = join(versionDir, 'bin', binaryName);

  if (!existsSync(binaryPath)) {
    const meta = await fetchVersionMetadata(platformPackage, version);
    output.debug(`Downloading ${meta.tarballUrl}`);
    const tarball = await downloadTarball(meta.tarballUrl);

    if (!verifyIntegrity(tarball, meta)) {
      throw new Error(
        `Integrity verification failed for ${platformPackage}@${version}. ` +
          `The downloaded tarball does not match the registry's published checksum.`
      );
    }

    const stagingDir = `${versionDir}.tmp-${process.pid}`;
    removeSync(stagingDir);
    try {
      await extractTarball(tarball, stagingDir);
      const extractedBinary = join(stagingDir, 'bin', binaryName);
      if (!existsSync(extractedBinary)) {
        throw new Error(
          `The ${platformPackage} package does not contain the expected binary at bin/${binaryName}.`
        );
      }
      chmodSync(extractedBinary, 0o755);
      moveSync(stagingDir, versionDir, { overwrite: false });
    } catch (err) {
      removeSync(stagingDir);
      if (!existsSync(binaryPath)) {
        throw err;
      }
    }
  }

  writePointer(
    {
      storeFormat: STORE_FORMAT,
      version,
      type: 'native',
      ...(opts.pinned ? { pinned: true } : {}),
    },
    root,
    { force: opts.force }
  );
  return version;
}

export function getStoreEntrypoint(
  version: string,
  root: string = getStoreRoot(),
  type: StorePointer['type'] = 'npm'
): string {
  if (type === 'native') {
    const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
    return join(getVersionDir(version, root, 'native'), 'bin', binaryName);
  }
  return join(getVersionDir(version, root), 'dist', 'vc.js');
}

function prefixCandidates(base: string | undefined): string[] {
  if (!base) return [];
  const candidates = [base];
  try {
    candidates.push(realpathSync(base));
  } catch (_) {}
  return candidates;
}

function isUnder(packageDir: string, base: string | undefined): boolean {
  return prefixCandidates(base).some(dir =>
    packageDir.startsWith(dir.replace(/[\\/]+$/, '') + sep)
  );
}

// Global locations are decided from two exact facts: PNPM_HOME, and the
// running node's own global root. Anything else (project deps, unknown
// layouts) runs the invoked version. Kept in sync with store-redirect.mjs.
export function isConfidentlyGlobal(packageDir: string): boolean {
  if (isUnder(packageDir, process.env.PNPM_HOME)) {
    return true;
  }

  const nodeBin = dirname(process.execPath);
  const npmGlobalRoot =
    process.platform === 'win32'
      ? join(nodeBin, 'node_modules')
      : join(dirname(nodeBin), 'lib', 'node_modules');
  return isUnder(packageDir, npmGlobalRoot);
}

// Seeding never changes payload type and never moves a pinned pointer.
export function shouldSeedStore(
  runningVersion: string,
  root: string = getStoreRoot()
): boolean {
  if (!semver.valid(runningVersion)) return false;
  const pointer = readPointer(root);
  if (pointer?.pinned) return false;
  if (pointer?.type === 'native') return false;
  if (pointer && semver.gte(pointer.version, runningVersion)) return false;
  return true;
}

interface SeedAttempt {
  version: string;
  attemptedAt: number;
}

const SEED_RETRY_INTERVAL = 1000 * 60 * 60 * 24; // 1 day

// One attempt per version per day, so unpublished dev builds and transient
// failures don't hit the registry on every invocation.
export function shouldAttemptSeed(
  version: string,
  root: string = getStoreRoot()
): boolean {
  try {
    const attempt = readJSONSync(
      join(root, 'seed-attempt.json')
    ) as SeedAttempt;
    if (
      attempt.version === version &&
      Date.now() - attempt.attemptedAt < SEED_RETRY_INTERVAL
    ) {
      return false;
    }
  } catch (_) {}
  return true;
}

export function recordSeedAttempt(
  version: string,
  root: string = getStoreRoot()
): void {
  mkdirpSync(root);
  writeJSONSync(join(root, 'seed-attempt.json'), {
    version,
    attemptedAt: Date.now(),
  } satisfies SeedAttempt);
}

export function shouldRedirectToStore(
  runningVersion: string,
  root: string = getStoreRoot()
): StorePointer | undefined {
  const pointer = readPointer(root);
  if (!pointer) return undefined;
  if (!semver.valid(runningVersion)) return undefined;
  // Never redirect to the same npm version (native is a payload switch).
  if (pointer.type !== 'native' && pointer.version === runningVersion)
    return undefined;
  // Pinned and native pointers always win (explicit user choice); an
  // unpinned npm pointer must be strictly newer.
  if (
    !pointer.pinned &&
    pointer.type !== 'native' &&
    !semver.gt(pointer.version, runningVersion)
  )
    return undefined;
  if (!existsSync(getStoreEntrypoint(pointer.version, root, pointer.type)))
    return undefined;
  return pointer;
}
