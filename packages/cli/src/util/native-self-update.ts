import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import tar from 'tar-fs';
import semver from 'semver';
import fetch, { toNodeReadable } from './fetch';
import pkg from './pkg';
import output from '../output-manager';
import { isNativeBinaryInstall } from './native-install';

const REGISTRY = 'https://registry.npmjs.org';

/**
 * Move a file, falling back to copy+delete when the source and destination
 * are on different filesystems (`rename` throws EXDEV, e.g. tmpfs /tmp ->
 * $HOME on Linux).
 */
async function moveFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw err;
    }
    await copyFile(source, destination);
    await rm(source, { force: true });
  }
}

export const CURL_INSTALL_COMMAND =
  'curl -fsSL https://api-frameworks.vercel.sh/install | sh';

/**
 * Platforms the native binary is built for. Keep in sync with
 * `packages/vc-native/scripts/platforms.mjs`.
 */
const SUPPORTED_PLATFORMS = new Set([
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
]);

/** Install root used by the curl installer (`api/_scripts/install.sh`). */
export function getInstallRoot(): string {
  // Normalize to an absolute path: symlink targets created under `bin/` are
  // stored verbatim, and a relative install root would make them resolve
  // relative to the `bin/` directory instead of the intended location.
  const root = process.env.VERCEL_INSTALL_DIR;
  return root ? resolve(root) : join(homedir(), '.vercel');
}

function platformTarget(): string {
  return `${process.platform}-${process.arch}`;
}

function isSupportedPlatform(): boolean {
  return SUPPORTED_PLATFORMS.has(platformTarget());
}

function unsupportedPlatformMessage(): string {
  const supported = Array.from(SUPPORTED_PLATFORMS).join(', ');
  return (
    `The native Vercel CLI binary is not available for your platform (${platformTarget()}). ` +
    `Supported platforms: ${supported}. ` +
    `You can install the CLI with a package manager instead: npm i -g vercel@latest`
  );
}

function nativePackageSuffix(): string {
  return `vc-native-${platformTarget()}`;
}

function nativePackageName(): string {
  return `@vercel/${nativePackageSuffix()}`;
}

/**
 * True when this process is the native binary installed by the curl
 * installer, i.e. it runs from `<install root>/versions/<version>/vercel`.
 */
export async function isCurlInstall(): Promise<boolean> {
  if (!isNativeBinaryInstall()) {
    return false;
  }

  const versionsPrefix = join(getInstallRoot(), 'versions') + sep;
  if (process.execPath.startsWith(versionsPrefix)) {
    return true;
  }

  try {
    // The `~/.vercel/bin/vercel` symlink points into the versions dir.
    const real = await realpath(process.execPath);
    return real.startsWith(versionsPrefix);
  } catch {
    return false;
  }
}

async function resolveLatestVersion(pkgName: string): Promise<string> {
  const res = await fetch(`${REGISTRY}/${pkgName}/latest`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch package metadata from the npm registry (HTTP ${res.status})`
    );
  }
  const manifest = (await res.json()) as { version?: string };
  if (!manifest.version || !semver.valid(manifest.version)) {
    throw new Error('Could not resolve the latest native binary version');
  }
  return manifest.version;
}

async function resolveLatestNativeVersion(): Promise<string> {
  return resolveLatestVersion(nativePackageName());
}

/**
 * All published versions of a package, newest first.
 */
export async function listAvailableVersions(
  pkgName: string
): Promise<string[]> {
  const res = await fetch(`${REGISTRY}/${pkgName}`, {
    headers: {
      // Abbreviated metadata: much smaller response.
      accept: 'application/vnd.npm.install-v1+json',
    },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch package metadata from the npm registry (HTTP ${res.status})`
    );
  }
  const manifest = (await res.json()) as {
    versions?: Record<string, unknown>;
  };
  const versions = Object.keys(manifest.versions ?? {}).filter(v =>
    semver.valid(v)
  );
  return versions.sort(semver.rcompare);
}

async function downloadAndExtractBinary(
  version: string,
  destination: string
): Promise<void> {
  if (!isSupportedPlatform()) {
    throw new Error(unsupportedPlatformMessage());
  }

  const suffix = nativePackageSuffix();
  const tarballUrl = `${REGISTRY}/@vercel/${suffix}/-/${suffix}-${version}.tgz`;

  const res = await fetch(tarballUrl);
  if (res.status === 404) {
    // The version exists for `vercel` but no native binary was published for
    // it — e.g. versions that predate the native builds.
    throw new Error(
      `No native binary is available for Vercel CLI v${version} on ${platformTarget()}. ` +
        `Older versions may predate native binary builds. ` +
        `You can install that version with a package manager instead: npm i -g vercel@${version}`
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to download ${tarballUrl} (HTTP ${res.status})`);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'vercel-upgrade-'));
  try {
    await pipeline(
      toNodeReadable(res.body),
      createGunzip(),
      tar.extract(tmpDir, {
        // Drop symlink/hardlink entries: they're the tar link-following
        // traversal vector (CVE-2024-12905 / CVE-2025-48387).
        ignore: (_name, header) =>
          header?.type !== 'file' && header?.type !== 'directory',
      })
    );

    const binary = join(tmpDir, 'package', 'bin', 'vercel');
    const stats = await stat(binary).catch(() => null);
    if (!stats?.isFile()) {
      throw new Error(
        'Downloaded tarball did not contain the expected binary (package/bin/vercel)'
      );
    }

    await mkdir(destination, { recursive: true });
    await chmod(binary, 0o755);
    await moveFile(binary, join(destination, 'vercel'));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function forceSymlink(target: string, linkPath: string): Promise<void> {
  await unlink(linkPath).catch(() => {});
  await symlink(target, linkPath);
}

/**
 * Point the `bin/vercel` and `bin/vc` symlinks at an installed version.
 */
async function linkVersion(version: string): Promise<void> {
  const installRoot = getInstallRoot();
  const binaryPath = join(installRoot, 'versions', version, 'vercel');
  const binDir = join(installRoot, 'bin');
  await mkdir(binDir, { recursive: true });
  await forceSymlink(binaryPath, join(binDir, 'vercel'));
  await forceSymlink(binaryPath, join(binDir, 'vc'));
}

/**
 * Ensure `<install root>/versions/<version>/vercel` exists, downloading the
 * native binary when missing, then link it as the active version.
 */
export async function installAndLinkVersion(version: string): Promise<void> {
  const installRoot = getInstallRoot();
  const versionDir = join(installRoot, 'versions', version);
  const binaryPath = join(versionDir, 'vercel');

  const existing = await stat(binaryPath).catch(() => null);
  if (!existing?.isFile()) {
    output.spinner(`Downloading Vercel CLI v${version}…`, 0);
    await downloadAndExtractBinary(version, versionDir);
  }

  await linkVersion(version);
}

/**
 * Base URL for PR-built binaries published by the `pr-binaries` workflow.
 * Each successful workflow publishes immutable artifacts under
 * `pr-binaries/<pr>/shas/<commit>` and then updates `current-sha`.
 */
const PR_BINARIES_URL =
  process.env.VERCEL_PR_BINARIES_URL ||
  'https://api-frameworks.vercel.sh/pr-binaries';

/**
 * Parse a PR target like `pr/115` or `pr-115` into a PR number.
 * Returns undefined for anything else (e.g. regular versions).
 */
export function parsePrTarget(target: string): number | undefined {
  const match = /^pr[/-](\d+)$/i.exec(target.trim());
  if (!match) {
    return undefined;
  }
  const pr = Number(match[1]);
  return Number.isSafeInteger(pr) && pr > 0 ? pr : undefined;
}

function prVersionDirName(pr: number): string {
  return `pr-${pr}`;
}

/**
 * True for version directory names created for PR builds (e.g. `pr-115`).
 */
function isPrVersionName(name: string): boolean {
  return /^pr-\d+$/.test(name);
}

async function fetchPrBuildSha(pr: number): Promise<string> {
  const url = `${PR_BINARIES_URL}/${pr}/current-sha`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error(
      `No binary found for PR #${pr}. ` +
        `The PR may not have a build yet, or the build may still be running.`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch current build for PR #${pr} (HTTP ${res.status})`
    );
  }
  const sha = (await res.text()).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Unexpected build SHA format for PR #${pr}`);
  }
  return sha;
}

export function getPrBinaryBaseUrl(pr: number, buildSha: string): string {
  return `${PR_BINARIES_URL}/${pr}/shas/${buildSha}`;
}

async function fetchPrChecksum(pr: number, buildSha: string): Promise<string> {
  const url = `${getPrBinaryBaseUrl(pr, buildSha)}/vercel-${platformTarget()}.sha256`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error(
      `No binary found for PR #${pr} on ${platformTarget()}. ` +
        `The PR may not have a build yet, or the build may still be running.`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch checksum for PR #${pr} (HTTP ${res.status})`
    );
  }
  // Format: "<sha256>  <filename>" (shasum output) or just the hash.
  const text = (await res.text()).trim();
  const sha = text.split(/\s+/)[0]?.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha ?? '')) {
    throw new Error(`Unexpected checksum format for PR #${pr}`);
  }
  return sha as string;
}

async function downloadPrBinary(
  pr: number,
  buildSha: string,
  expectedSha: string,
  destination: string
): Promise<void> {
  if (!isSupportedPlatform()) {
    throw new Error(unsupportedPlatformMessage());
  }

  const url = `${getPrBinaryBaseUrl(pr, buildSha)}/vercel-${platformTarget()}`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error(
      `No binary found for PR #${pr} on ${platformTarget()}. ` +
        `The PR may not have a build yet, or the build may still be running.`
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to download ${url} (HTTP ${res.status})`);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'vercel-pr-'));
  try {
    const tmpBinary = join(tmpDir, 'vercel');
    const hash = createHash('sha256');
    const body = toNodeReadable(res.body);
    body.on('data', (chunk: Uint8Array) => hash.update(chunk));
    await pipeline(body, createWriteStream(tmpBinary));

    const actualSha = hash.digest('hex');
    if (actualSha !== expectedSha) {
      throw new Error(
        `Checksum mismatch for PR #${pr} binary. ` +
          `The build may have been updated mid-download; try again.`
      );
    }

    await mkdir(destination, { recursive: true });
    await chmod(tmpBinary, 0o755);
    await moveFile(tmpBinary, join(destination, 'vercel'));
    // Remember which build this is so re-runs can detect new pushes.
    await writeFile(join(destination, 'vercel.sha256'), `${actualSha}\n`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Install (or refresh) the binary built for a PR and link it as the active
 * CLI. PR builds are mutable — every push overwrites the published binary —
 * so this always compares the remote checksum against the installed copy and
 * re-downloads when they differ.
 *
 * Returns `updated: false` when the installed copy already matches the
 * latest build for the PR.
 */
export async function installAndLinkPrBinary(
  pr: number
): Promise<{ updated: boolean; buildSha: string }> {
  const installRoot = getInstallRoot();
  const versionDir = join(installRoot, 'versions', prVersionDirName(pr));
  const binaryPath = join(versionDir, 'vercel');
  const shaPath = join(versionDir, 'vercel.sha256');

  output.spinner(`Checking latest build for PR #${pr}…`, 0);
  const buildSha = await fetchPrBuildSha(pr);
  const remoteSha = await fetchPrChecksum(pr, buildSha);

  const existing = await stat(binaryPath).catch(() => null);
  const localSha = existing?.isFile()
    ? (await readFile(shaPath, 'utf8').catch(() => '')).trim().split(/\s+/)[0]
    : undefined;

  if (existing?.isFile() && localSha === remoteSha) {
    await linkVersion(prVersionDirName(pr));
    return { updated: false, buildSha };
  }

  output.spinner(`Downloading Vercel CLI build for PR #${pr}…`, 0);
  await downloadPrBinary(pr, buildSha, remoteSha, versionDir);
  await linkVersion(prVersionDirName(pr));
  return { updated: true, buildSha };
}

/**
 * Versions installed under `<install root>/versions`, newest first.
 */
export async function listInstalledVersions(): Promise<string[]> {
  const versionsDir = join(getInstallRoot(), 'versions');
  const entries = await readdir(versionsDir, { withFileTypes: true }).catch(
    () => []
  );
  const versions: string[] = [];
  const prBuilds: string[] = [];
  for (const entry of entries) {
    const isPr = isPrVersionName(entry.name);
    if (!entry.isDirectory() || (!semver.valid(entry.name) && !isPr)) {
      continue;
    }
    const binary = join(versionsDir, entry.name, 'vercel');
    const stats = await stat(binary).catch(() => null);
    if (stats?.isFile()) {
      (isPr ? prBuilds : versions).push(entry.name);
    }
  }
  // Release versions newest first, then PR builds.
  return [...versions.sort(semver.rcompare), ...prBuilds.sort()];
}

/**
 * The version the `bin/vercel` symlink currently points at, if resolvable.
 * May be a release version (`58.7.1`) or a PR build name (`pr-115`).
 */
export async function getLinkedVersion(): Promise<string | undefined> {
  const link = join(getInstallRoot(), 'bin', 'vercel');
  try {
    const target = await readlink(link);
    const segments = target.split(sep);
    const versionsIdx = segments.lastIndexOf('versions');
    const version = versionsIdx >= 0 ? segments[versionsIdx + 1] : undefined;
    return version && (semver.valid(version) || isPrVersionName(version))
      ? version
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the active `bin/vercel` symlink points at a PR build directory.
 */
export async function isLinkedToPrBuild(): Promise<boolean> {
  const linked = await getLinkedVersion();
  return linked !== undefined && isPrVersionName(linked);
}

function pinFilePath(): string {
  return join(getInstallRoot(), 'pinned');
}

/**
 * Record that the user explicitly chose the linked version
 * (`vc version use`), so automatic updates leave it alone.
 */
export async function setPinnedVersion(version: string): Promise<void> {
  await writeFile(pinFilePath(), `${version}\n`);
}

/** Remove the pin (explicit upgrades unpin). */
export async function clearPinnedVersion(): Promise<void> {
  await unlink(pinFilePath()).catch(() => {});
}

/**
 * The pinned version, but only while the pin still matches the linked
 * version. If the symlink was re-pointed some other way, the pin is stale
 * and ignored.
 */
export async function getPinnedVersion(): Promise<string | undefined> {
  const pinned = (await readFile(pinFilePath(), 'utf8').catch(() => ''))
    .trim()
    .split(/\s+/)[0];
  if (!pinned) {
    return undefined;
  }
  const linked = await getLinkedVersion();
  return pinned === linked ? pinned : undefined;
}

/**
 * The sha256 recorded for an installed PR build, if present. Used to show
 * which push of the PR is installed.
 */
export async function getPrBuildSha(name: string): Promise<string | undefined> {
  const shaPath = join(getInstallRoot(), 'versions', name, 'vercel.sha256');
  const sha = (await readFile(shaPath, 'utf8').catch(() => ''))
    .trim()
    .split(/\s+/)[0];
  return /^[0-9a-f]{64}$/.test(sha) ? sha : undefined;
}

/**
 * When a native binary was installed through a package manager (as the
 * `vercel` package's optional dependency), returns the command that removes
 * that install. Detected from the real binary location, since the package
 * manager's global layout appears in `process.execPath`.
 */
function packageManagerRemovalCommand(): string | undefined {
  const segments = process.execPath.split(sep);
  if (segments.includes('pnpm') || segments.includes('.pnpm')) {
    return 'pnpm rm -g vercel';
  }
  if (segments.includes('yarn') || segments.includes('.yarn')) {
    return 'yarn global remove vercel';
  }
  return 'npm rm -g vercel';
}

/**
 * After migrating a package-manager-installed native binary into the
 * `~/.vercel` layout, the old install still shadows the new one on `PATH`.
 * Tell the user how to remove it, tailored to their package manager.
 */
async function printMigrationCleanup(): Promise<void> {
  if (await isCurlInstall()) {
    return;
  }

  const removalCommand = packageManagerRemovalCommand();
  const binDir = join(getInstallRoot(), 'bin');
  output.print('\n');
  output.log(
    `The Vercel CLI now updates itself in ${binDir} and no longer needs your package manager.`
  );
  output.log(
    `Remove the old install so the new binary takes effect: ${removalCommand}`
  );
  output.log(
    'Then open a new terminal (or run `hash -r`) so your shell picks up the new binary.'
  );
}

/**
 * Self-update for native binary installs: downloads the latest native binary
 * into `<install root>/versions/<version>/vercel` and re-points the
 * `bin/vercel` and `bin/vc` symlinks — the same layout the curl installer
 * uses. Package-manager installs are migrated into this layout and told to
 * remove the old install.
 */
export async function executeNativeSelfUpdate(
  targetVersion?: string
): Promise<number> {
  try {
    output.spinner('Checking for updates…', 0);
    const version = targetVersion ?? (await resolveLatestNativeVersion());
    const onPrBuild = await isLinkedToPrBuild();

    if (
      !targetVersion &&
      !onPrBuild &&
      semver.valid(version) &&
      semver.valid(pkg.version) &&
      semver.gte(pkg.version, version)
    ) {
      output.stopSpinner();
      output.log(
        `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
      );
      return 0;
    }

    if (onPrBuild) {
      output.stopSpinner();
      output.log(
        `Currently on a PR build (${await getLinkedVersion()}). Switching back to the latest release…`
      );
    }

    await installAndLinkVersion(version);
    // An explicit upgrade is a request to track releases again.
    await clearPinnedVersion();

    output.stopSpinner();
    output.success(`Vercel CLI has been upgraded to v${version} successfully!`);
    await printMigrationCleanup();
    return 0;
  } catch (error) {
    output.stopSpinner();
    output.error(
      `Upgrade failed: ${error instanceof Error ? error.message : String(error)}`
    );
    output.log(`You can try reinstalling manually: ${CURL_INSTALL_COMMAND}`);
    return 1;
  }
}
