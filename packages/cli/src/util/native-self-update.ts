import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import tar from 'tar-fs';
import semver from 'semver';
import fetch, { toNodeReadable, type Response } from './fetch';
import output from '../output-manager';
import { getInstallRoot, isNativeBinaryInstall } from './native-install';
import {
  activateSlot,
  markPendingProduction,
  readActivePointer,
  readSlotMetadata,
  withNativeInstallLock,
  writeTrackSlot,
  type NativeSlot,
} from './native-install-layout';

export { getInstallRoot } from './native-install';
export {
  readActivePointer,
  readNativeInstallState,
} from './native-install-layout';

const REGISTRY = 'https://registry.npmjs.org';

export interface NativeUpdateOptions {
  signal?: AbortSignal;
}

function discardResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

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
  'curl -fsSL https://api-frameworks.vercel.sh/install | bash';

/**
 * Platforms the native binary is built for. Keep in sync with
 * `packages/vc-native/scripts/platforms.mjs`.
 */
const SUPPORTED_PLATFORMS = new Set([
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
]);

/**
 * The running Node's libc: a glibc-linked runtime reports its glibc version
 * in the diagnostic report header, a musl-linked one does not.
 */
function isMuslRuntime(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const report = process.report?.getReport() as unknown as
      | { header?: { glibcVersionRuntime?: string } }
      | undefined;
    return report !== undefined && !report.header?.glibcVersionRuntime;
  } catch {
    return false;
  }
}

function platformTarget(): string {
  const target = `${process.platform}-${process.arch}`;
  return isMuslRuntime() ? `${target}-musl` : target;
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

export function getNativePackageName(): string {
  return `@vercel/${nativePackageSuffix()}`;
}

/**
 * True when this process is a native binary installed by the curl installer.
 * Legacy paths are recognized for detection only.
 */
export async function isCurlInstall(): Promise<boolean> {
  if (!isNativeBinaryInstall()) {
    return false;
  }

  const root = getInstallRoot();
  // Managed slots live below the legacy `versions` prefix so released native
  // CLIs continue to recognize the installation after a track switch.
  const managedPrefixes = [join(root, 'versions') + sep];
  if (managedPrefixes.some(prefix => process.execPath.startsWith(prefix))) {
    return true;
  }

  try {
    const real = await realpath(process.execPath);
    return managedPrefixes.some(prefix => real.startsWith(prefix));
  } catch {
    return false;
  }
}

async function resolveLatestVersion(
  pkgName: string,
  { signal }: NativeUpdateOptions = {}
): Promise<string> {
  const res = await fetch(`${REGISTRY}/${pkgName}/latest`, { signal });
  if (!res.ok) {
    discardResponseBody(res);
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

export async function resolveLatestNativeVersion(
  options?: NativeUpdateOptions
): Promise<string> {
  return resolveLatestVersion(getNativePackageName(), options);
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
  destination: string,
  { signal }: NativeUpdateOptions = {}
): Promise<void> {
  if (!isSupportedPlatform()) {
    throw new Error(unsupportedPlatformMessage());
  }

  const suffix = nativePackageSuffix();
  const tarballUrl = `${REGISTRY}/@vercel/${suffix}/-/${suffix}-${version}.tgz`;

  const res = await fetch(tarballUrl, { signal });
  if (res.status === 404) {
    discardResponseBody(res);
    // The version exists for `vercel` but no native binary was published for
    // it — e.g. versions that predate the native builds.
    throw new Error(
      `No native binary is available for Vercel CLI v${version} on ${platformTarget()}. ` +
        `Older versions may predate native binary builds. ` +
        `You can install that version with a package manager instead: npm i -g vercel@${version}`
    );
  }
  if (!res.ok) {
    discardResponseBody(res);
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
      }),
      { signal }
    );
    signal?.throwIfAborted();

    const binary = join(tmpDir, 'package', 'bin', 'vercel');
    const stats = await stat(binary).catch(() => null);
    if (!stats?.isFile()) {
      throw new Error(
        'Downloaded tarball did not contain the expected binary (package/bin/vercel)'
      );
    }

    signal?.throwIfAborted();
    await mkdir(destination, { recursive: true });
    await chmod(binary, 0o755);
    await moveFile(binary, join(destination, 'vercel'));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Base URL for PR-built binaries published by the `pr-binaries` workflow.
 * Each matrix job publishes immutable artifacts under
 * `pr-binaries/<pr>/shas/<commit>` and then updates `current-sha`.
 * The pointer can land before every platform is uploaded.
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

async function fetchPrBuildSha(pr: number): Promise<string> {
  const url = `${PR_BINARIES_URL}/${pr}/current-sha`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error(
      `Couldn't find a binary for PR #${pr}. ` +
        `The current-sha pointer is not published yet.`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch the current build for PR #${pr} (HTTP ${res.status}).`
    );
  }
  const sha = (await res.text()).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Unexpected build SHA format for PR #${pr}.`);
  }
  return sha;
}

/**
 * User-facing error when `current-sha` exists but this platform's binary
 * has not been uploaded yet.
 */
export function missingPrPlatformMessage(pr: number, buildSha: string): string {
  const platform = platformTarget();
  const shortSha = buildSha.slice(0, 12);
  return (
    `Couldn't find a ${platform} binary for PR #${pr} (${shortSha}). ` +
    `This SHA exists, but this platform isn't ready yet.`
  );
}

export function getPrBinaryBaseUrl(pr: number, buildSha: string): string {
  return `${PR_BINARIES_URL}/${pr}/shas/${buildSha}`;
}

async function fetchPrChecksum(pr: number, buildSha: string): Promise<string> {
  const url = `${getPrBinaryBaseUrl(pr, buildSha)}/vercel-${platformTarget()}.sha256`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error(missingPrPlatformMessage(pr, buildSha));
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch the checksum for PR #${pr} (HTTP ${res.status}).`
    );
  }
  // Format: "<sha256>  <filename>" (shasum output) or just the hash.
  const text = (await res.text()).trim();
  const sha = text.split(/\s+/)[0]?.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha ?? '')) {
    throw new Error(`Unexpected checksum format for PR #${pr}.`);
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
    throw new Error(missingPrPlatformMessage(pr, buildSha));
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
    // Remember the binary checksum so re-runs can detect new pushes.
    await writeFile(join(destination, 'vercel.sha256'), `${actualSha}\n`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function findTrackSlot(
  track: 'production' | 'pr',
  matches: (metadata: {
    version: string;
    pr?: number;
    buildSha?: string;
  }) => boolean
): Promise<NativeSlot | undefined> {
  const root = getInstallRoot();
  for (const slot of ['a', 'b'] as const) {
    const metadata = await readSlotMetadata(root, track, slot);
    const binary = await stat(
      join(root, 'versions', 'tracks', track, slot, 'vercel')
    ).catch(() => undefined);
    if (metadata && binary?.isFile() && matches(metadata)) return slot;
  }
  return undefined;
}

async function findNewestProductionSlotAtLeast(
  version: string
): Promise<{ slot: NativeSlot; version: string } | undefined> {
  const root = getInstallRoot();
  let newest: { slot: NativeSlot; version: string } | undefined;
  for (const slot of ['a', 'b'] as const) {
    const metadata = await readSlotMetadata(root, 'production', slot);
    const binary = await stat(
      join(root, 'versions', 'tracks', 'production', slot, 'vercel')
    ).catch(() => undefined);
    if (
      metadata &&
      binary?.isFile() &&
      semver.valid(metadata.version) &&
      semver.gte(metadata.version, version) &&
      (!newest || semver.gt(metadata.version, newest.version))
    ) {
      newest = { slot, version: metadata.version };
    }
  }
  return newest;
}

/** Install a production release in a bounded slot and activate it. */
export async function installAndActivateProductionVersion(
  version: string
): Promise<{ slot: NativeSlot; downloaded: boolean }> {
  const root = getInstallRoot();
  return withNativeInstallLock(root, async () => {
    const existing = await findTrackSlot(
      'production',
      metadata => metadata.version === version
    );
    if (existing) {
      await activateSlot(root, 'production', existing);
      return { slot: existing, downloaded: false };
    }

    output.spinner(`Downloading Vercel CLI v${version}…`, 0);
    const slot = await writeTrackSlot(
      root,
      { track: 'production', version },
      directory => downloadAndExtractBinary(version, directory)
    );
    await activateSlot(root, 'production', slot);
    return { slot, downloaded: true };
  });
}

/** Install the current build for a PR in a bounded slot and activate it. */
export async function installAndActivatePrBinary(
  pr: number
): Promise<{ updated: boolean; buildSha: string; slot: NativeSlot }> {
  const root = getInstallRoot();
  return withNativeInstallLock(root, async () => {
    output.spinner(`Checking latest build for PR #${pr}…`, 0);
    const buildSha = await fetchPrBuildSha(pr);
    const remoteSha = await fetchPrChecksum(pr, buildSha);
    const existing = await findTrackSlot(
      'pr',
      metadata => metadata.pr === pr && metadata.buildSha === buildSha
    );
    if (existing) {
      await activateSlot(root, 'pr', existing);
      return { updated: false, buildSha, slot: existing };
    }

    output.spinner(`Downloading Vercel CLI build for PR #${pr}…`, 0);
    const slot = await writeTrackSlot(
      root,
      {
        track: 'pr',
        version: `pr/${pr}`,
        pr,
        buildSha,
      },
      async directory => {
        await downloadPrBinary(pr, buildSha, remoteSha, directory);
        await writeFile(join(directory, 'build-sha'), `${buildSha}\n`);
      }
    );
    await activateSlot(root, 'pr', slot);
    return { updated: true, buildSha, slot };
  });
}

/**
 * Stage a production release in the inactive production slot. Activation is
 * allowed only when production is selected; a PR selection is never replaced.
 */
export async function stageProductionUpdate(
  version: string,
  selectProduction = false,
  options: NativeUpdateOptions = {}
): Promise<{ slot: NativeSlot; downloaded: boolean; activated: boolean }> {
  const root = getInstallRoot();
  return withNativeInstallLock(
    root,
    async () => {
      options.signal?.throwIfAborted();
      const active = await readActivePointer(root);
      options.signal?.throwIfAborted();
      // Legacy curl installs have no track pointer yet; treat them as
      // production-selected so the first slot update migrates the live binary.
      const activated = selectProduction || active?.track !== 'pr';
      const installed = await findNewestProductionSlotAtLeast(version);
      options.signal?.throwIfAborted();
      if (installed) {
        await markPendingProduction(root, installed.slot, installed.version);
        if (activated) {
          options.signal?.throwIfAborted();
          await activateSlot(root, 'production', installed.slot);
        }
        return { slot: installed.slot, downloaded: false, activated };
      }

      const slot = await writeTrackSlot(
        root,
        { track: 'production', version },
        directory => downloadAndExtractBinary(version, directory, options),
        options
      );
      options.signal?.throwIfAborted();
      await markPendingProduction(root, slot, version);
      if (activated) {
        options.signal?.throwIfAborted();
        await activateSlot(root, 'production', slot);
      }
      return { slot, downloaded: true, activated };
    },
    { wait: false }
  );
}
