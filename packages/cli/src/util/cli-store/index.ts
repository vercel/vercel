/**
 * Managed CLI store (experimental; opt in via `vc upgrade --experimental`).
 *
 * A self-owned directory holding versioned copies of the CLI, with an
 * atomically-updated pointer file selecting the active version:
 *
 *   ~/.vercel/cli/
 *   ├── versions/
 *   │   └── 54.19.0/          extracted npm tarball (write-once, immutable)
 *   │       ├── package.json
 *   │       └── dist/vc.js
 *   └── current.json          { storeFormat, version, type }
 *
 * `vc upgrade` populates the store by downloading the tarball directly from
 * the npm registry, verifying its integrity against the registry metadata,
 * extracting it to a version directory, and flipping the pointer with an
 * atomic rename. The entrypoint (dist/vc.js) redirects to the store's
 * current version when it is newer than the running package.
 *
 * This never invokes a package manager and never needs to know how the CLI
 * was installed — the store lifecycle is identical whether the entrypoint
 * arrived via npm, pnpm, yarn, or a standalone installer. Native binary
 * installs (VERCEL_VC_NATIVE=1) are excluded for now: the pointer's `type`
 * field is reserved for a future native payload.
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
} from 'fs-extra';
import output from '../../output-manager';

export const STORE_FORMAT = 1;

export interface StorePointer {
  storeFormat: number;
  version: string;
  /** Payload type. 'npm' = extracted npm tarball run via node.
   * 'native' = standalone platform binary, exec'd directly. */
  type: 'npm' | 'native';
}

export const NATIVE_PACKAGE_SCOPE = '@vercel/vc-native';

/** The platform-specific npm package carrying the native binary. */
export function getNativePlatformPackage(): string {
  return `${NATIVE_PACKAGE_SCOPE}-${process.platform}-${process.arch}`;
}

/**
 * The store is active when the machine has opted in. Enrollment is the
 * explicit act of running `vc upgrade --experimental`, which creates the
 * store; from then on, its existence (a valid pointer) is the enrollment
 * signal. Env overrides: VERCEL_CLI_STORE=1 forces on (testing),
 * VERCEL_CLI_STORE=0 forces off (bypass).
 */
export function isCliStoreEnabled(): boolean {
  const env = process.env.VERCEL_CLI_STORE;
  if (env === '1') return true;
  if (env === '0') return false;
  return readPointer() !== undefined;
}

/**
 * Resolves the store root directory. Overridable for tests and for users who
 * need the store somewhere other than the home directory.
 */
export function getStoreRoot(): string {
  return process.env.VERCEL_CLI_STORE_DIR || join(homedir(), '.vercel', 'cli');
}

export function getPointerPath(root: string = getStoreRoot()): string {
  return join(root, 'current.json');
}

/**
 * Unenrolls the machine from the managed upgrade channel by removing the
 * store. Installed copies revert to running themselves (package-manager
 * managed) — the store's existence is the enrollment signal.
 */
export function removeStore(root: string = getStoreRoot()): void {
  removeSync(root);
}

/**
 * Version directories are namespaced by payload type (versions/npm/<v>,
 * versions/native/<v> in the future) so npm-tarball and native-binary
 * payloads of the same release can coexist in one store without a format
 * bump.
 */
export function getVersionDir(
  version: string,
  root: string = getStoreRoot(),
  type: StorePointer['type'] = 'npm'
): string {
  return join(root, 'versions', type, version);
}

/**
 * Reads the pointer file. Returns undefined when missing, malformed, or from
 * an incompatible (newer) store format — a shim that does not understand the
 * store must behave as if the store does not exist rather than misbehave.
 */
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
  } catch (_) {
    // missing or unreadable — treat as no store
  }
  return undefined;
}

/**
 * Atomically updates the pointer: write to a temp file in the same directory,
 * then rename over the destination. Readers see either the old pointer or the
 * new one, never a partial write.
 *
 * The pointer is monotonic: writes that would lower the version are ignored.
 * This lets the background self-seeder and explicit upgrades race safely —
 * whichever writes the newer version wins, and a slow seed of an older
 * version can never undo an upgrade that completed meanwhile.
 */
export function writePointer(
  pointer: StorePointer,
  root: string = getStoreRoot()
): void {
  const existing = readPointer(root);
  if (existing && semver.gte(existing.version, pointer.version)) {
    return;
  }
  const dest = getPointerPath(root);
  mkdirpSync(dirname(dest));
  const tmp = `${dest}.tmp-${process.pid}`;
  writeJSONSync(tmp, pointer);
  renameSync(tmp, dest);
}

/**
 * Verifies content bytes against an SRI integrity string ("sha512-<base64>")
 * or a legacy hex sha1 shasum. Returns true only on a positive match.
 */
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

/**
 * Extracts a gzipped npm tarball (entries prefixed with "package/") into the
 * destination directory.
 */
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

/**
 * The published CLI bundle marks its runtime dependencies as external, so an
 * extracted tarball is not self-sufficient — by design, to keep the tarball
 * small. Install those runtime packages into the version directory itself.
 *
 * Runtime packages may be declared as dependencies or as peerDependencies
 * (the CLI is moving externals to peers); npm >= 7 installs both. Either
 * way the install is scoped strictly to the staging dir via cwd — never
 * global, never the user's project. That containment is what distinguishes
 * this from the install-method-guessing the store exists to replace. (Same
 * pattern as turborepo's just-in-time platform-binary repair.)
 */
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

  // Remove devDependencies before installing: even with --omit=dev, npm
  // resolves them to record in the lockfile, and the published manifest's
  // devDependencies reference unpublished workspace packages
  // (@vercel-internals/*), which turns the install into a registry 404.
  if (manifest.devDependencies) {
    delete manifest.devDependencies;
    writeJSONSync(manifestPath, manifest);
  }

  // Erase npm_config_global so a store install triggered from within a
  // global npm context does not deadlock on the global installation lock
  // (same fix as turborepo's launcher).
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

/**
 * Translates common npm failures from the contained dependency install into
 * actionable messages instead of raw npm stderr.
 */
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

/**
 * Downloads, verifies, and installs a version into the store, then flips the
 * pointer. Returns the measured version from the extracted package.json —
 * never a value assumed from the request.
 */
export async function installVersionToStore(
  packageName: string,
  version: string,
  root: string = getStoreRoot()
): Promise<string> {
  const versionDir = getVersionDir(version, root);

  if (!existsSync(join(versionDir, 'package.json'))) {
    const meta = await fetchVersionMetadata(packageName, version);
    output.debug(`Downloading ${meta.tarballUrl}`);
    const tarball = await downloadTarball(meta.tarballUrl);

    if (!verifyIntegrity(tarball, meta)) {
      throw new Error(
        `Integrity verification failed for ${packageName}@${version}. ` +
          `The downloaded tarball does not match the registry's published checksum.`
      );
    }

    // Extract to a temp sibling, then move into place so a version directory
    // is either complete or absent — never half-extracted.
    const stagingDir = `${versionDir}.tmp-${process.pid}`;
    removeSync(stagingDir);
    try {
      await extractTarball(tarball, stagingDir);
      installRuntimeDependencies(stagingDir);
      moveSync(stagingDir, versionDir, { overwrite: false });
    } catch (err) {
      removeSync(stagingDir);
      // A concurrent process may have installed the same version between our
      // existence check and the move; that is success, not failure.
      if (!existsSync(join(versionDir, 'package.json'))) {
        throw err;
      }
    }
  }

  // Measure what actually landed on disk rather than trusting the request.
  const installed = readJSONSync(join(versionDir, 'package.json')) as {
    version?: string;
  };
  if (!installed.version || !semver.valid(installed.version)) {
    removeSync(versionDir);
    throw new Error(
      `Installed package at ${versionDir} has an invalid version — removed.`
    );
  }

  writePointer(
    { storeFormat: STORE_FORMAT, version: installed.version, type: 'npm' },
    root
  );
  return installed.version;
}

/**
 * Downloads, verifies, and installs a native binary version into the store,
 * then flips the pointer to the native payload. The binary comes from the
 * platform-specific npm package (@vercel/vc-native-<platform>-<arch>),
 * verified against the registry's published checksum. The extracted binary
 * is never modified, so its code signature remains intact.
 */
export async function installNativeVersionToStore(
  version: string,
  root: string = getStoreRoot()
): Promise<string> {
  const platformPackage = getNativePlatformPackage();
  const versionDir = getVersionDir(version, root, 'native');
  const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
  // Must match getStoreEntrypoint: the binary lives at <versionDir>/bin/<name>.
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
      // The platform package carries the binary at bin/<name>.
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

  writePointer({ storeFormat: STORE_FORMAT, version, type: 'native' }, root);
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

const LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
];

/**
 * Store participation (redirect and seeding) is limited to installations we
 * can confidently classify as global. Asymmetric by design: a false
 * negative means an install keeps today's package-manager-managed behavior,
 * while project dependencies must never participate — redirecting them
 * would break lockfile reproducibility. Anything ambiguous resolves to
 * "not global".
 *
 * Mirrored in store-redirect.mjs, which must stay dependency-free — keep
 * the two implementations in sync.
 */
export function isConfidentlyGlobal(packageDir: string): boolean {
  // pnpm global installs of any layout generation live under PNPM_HOME.
  const pnpmHome = process.env.PNPM_HOME;
  if (
    pnpmHome &&
    packageDir.startsWith(pnpmHome.replace(/[\\/]+$/, '') + sep)
  ) {
    return true;
  }

  // npm/yarn-classic globals: under node_modules with NO lockfile in any
  // ancestor — npm never writes lockfiles for globals, while a project
  // dependency always has one above it.
  if (!packageDir.includes(sep + 'node_modules' + sep)) {
    return false;
  }
  let dir = packageDir;
  for (let i = 0; i < 30; i++) {
    for (const lockfile of LOCKFILES) {
      if (existsSync(join(dir, lockfile))) {
        return false;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return true;
}

/**
 * True when the store should be seeded with the running version: the flag is
 * on, and the pointer is absent or older than the running version. Used by
 * the background self-seeder so that merely running the CLI converges every
 * install on the machine to the newest version anyone has installed —
 * without requiring an explicit `vc upgrade`.
 *
 * A native-pointer machine is never seeded by npm-payload installs: the
 * user chose the binary; only explicit `vc upgrade` moves a native pointer.
 */
export function shouldSeedStore(
  runningVersion: string,
  root: string = getStoreRoot()
): boolean {
  if (!semver.valid(runningVersion)) return false;
  const pointer = readPointer(root);
  if (pointer?.type === 'native') return false;
  if (pointer && semver.gte(pointer.version, runningVersion)) return false;
  return true;
}

interface SeedAttempt {
  version: string;
  attemptedAt: number;
}

const SEED_RETRY_INTERVAL = 1000 * 60 * 60 * 24; // 1 day

/**
 * Rate limit for background seeding: at most one attempt per version per
 * day. Prevents unpublished versions (dev builds) or transient registry
 * failures from triggering a registry round-trip on every CLI invocation.
 */
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
  } catch (_) {
    // no marker — attempt allowed
  }
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

/**
 * True when a store version exists, is valid, and is newer than the provided
 * running version — i.e. the entrypoint should redirect to it.
 */
export function shouldRedirectToStore(
  runningVersion: string,
  root: string = getStoreRoot()
): StorePointer | undefined {
  const pointer = readPointer(root);
  if (!pointer) return undefined;
  if (!semver.valid(runningVersion)) return undefined;
  // A native pointer always wins over an npm-payload install (the user
  // chose the binary); an npm pointer must be strictly newer.
  if (pointer.type !== 'native' && !semver.gt(pointer.version, runningVersion))
    return undefined;
  if (!existsSync(getStoreEntrypoint(pointer.version, root, pointer.type)))
    return undefined;
  return pointer;
}
