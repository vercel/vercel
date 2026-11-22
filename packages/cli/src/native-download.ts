// Downloads the native binary for `dist/vc.js` when its platform package is
// missing, for example because the install skipped optional dependencies.
// Loaded only on that path, so it never slows a normal launch.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import tar from 'tar-fs';
import fetch, { toNodeReadable, type FetchDispatcher } from './util/fetch';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const METADATA_TIMEOUT_MS = 15_000;
const STALL_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 5 * 60_000;
const PROGRESS_INTERVAL_MS = 30_000;
const START_TIMEOUT_MS = 30_000;
// Older than any download that can still be running.
const STALE_TEMP_MS = 2 * TOTAL_TIMEOUT_MS;

/** A download failure, with a short cause for the launcher's warning. */
export class NativeDownloadError extends Error {
  constructor(readonly detail: string) {
    super(`Couldn't download the Vercel CLI binary (${detail})`);
    this.name = 'NativeDownloadError';
  }
}

export interface DownloadNativeBinaryOptions {
  /** Platform target, such as `darwin-arm64` or `linux-x64-musl`. */
  target: string;
  /** Exact version of the `vercel` package that is launching. */
  version: string;
  /** Versioned cache directory. The binary is written to `<directory>/vercel`. */
  directory: string;
  /** Progress lines for stderr. Omitted when stderr must stay quiet. */
  log?: (line: string) => void;
}

/**
 * Download `@vercel/vc-native-<target>@<version>`, check it against the
 * registry's integrity hash, check that it starts, and move it into place.
 * Concurrent launches each work in their own temporary files, and the final
 * rename is atomic, so a partial binary is never visible.
 */
export async function downloadNativeBinary({
  target,
  version,
  directory,
  log,
}: DownloadNativeBinaryOptions): Promise<string> {
  const registry = (
    process.env.__VERCEL_NATIVE_DOWNLOAD_REGISTRY || DEFAULT_REGISTRY
  ).replace(/\/+$/, '');
  const id = randomUUID();
  const archive = join(directory, `.download-${id}.tgz`);
  const extracted = join(directory, `.extract-${id}`);
  const deadline = AbortSignal.timeout(TOTAL_TIMEOUT_MS);

  log?.(`Downloading the Vercel CLI binary for ${target}…`);
  try {
    await mkdir(directory, { recursive: true });
    await removeStaleTempFiles(directory);
    const dispatcher = await getProxyDispatcher();
    const { tarball, integrity } = await resolveTarball({
      registry,
      name: `@vercel/vc-native-${target}`,
      version,
      dispatcher,
      deadline,
    });
    await downloadVerified({
      url: tarball,
      integrity,
      destination: archive,
      dispatcher,
      deadline,
      onProgress: bytes =>
        log?.(
          `Downloading the Vercel CLI binary for ${target}… ${formatMegabytes(bytes)}`
        ),
    });
    await pipeline(
      createReadStream(archive),
      createGunzip(),
      tar.extract(extracted, {
        // Keep only regular files and directories: links are the tar
        // traversal vector (CVE-2024-12905 / CVE-2025-48387).
        ignore: (_name: string, header?: { type?: string }) =>
          header?.type !== 'file' && header?.type !== 'directory',
      })
    );
    const binary = join(extracted, 'package', 'bin', 'vercel');
    if (!(await stat(binary).catch(() => null))?.isFile()) {
      throw new NativeDownloadError('the package has no binary');
    }
    await chmod(binary, 0o755);
    checkStarts(binary);
    const destination = join(directory, 'vercel');
    await rename(binary, destination);
    return destination;
  } catch (error) {
    throw error instanceof NativeDownloadError
      ? error
      : new NativeDownloadError(describeError(error, deadline));
  } finally {
    await rm(archive, { force: true }).catch(() => undefined);
    await rm(extracted, { recursive: true, force: true }).catch(
      () => undefined
    );
  }
}

/**
 * A killed launch (Ctrl+C, an agent stopping a command) skips cleanup and
 * leaves its temporary files. Remove those, never ones a download that is
 * still running could own.
 */
async function removeStaleTempFiles(directory: string): Promise<void> {
  const entries = await readdir(directory).catch(() => []);
  for (const entry of entries) {
    if (!entry.startsWith('.download-') && !entry.startsWith('.extract-')) {
      continue;
    }
    const path = join(directory, entry);
    const stats = await stat(path).catch(() => null);
    if (stats && Date.now() - stats.mtimeMs > STALE_TEMP_MS) {
      await rm(path, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function getProxyDispatcher(): Promise<FetchDispatcher | undefined> {
  const configured = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'].some(
    name => process.env[name] || process.env[name.toLowerCase()]
  );
  if (!configured) return undefined;
  const { EnvProxyDispatcher } = await import('./util/fetch-proxy');
  return new EnvProxyDispatcher();
}

async function resolveTarball({
  registry,
  name,
  version,
  dispatcher,
  deadline,
}: {
  registry: string;
  name: string;
  version: string;
  dispatcher?: FetchDispatcher;
  deadline: AbortSignal;
}): Promise<{ tarball: string; integrity: string }> {
  const url = `${registry}/${name.replace('/', '%2f')}/${encodeURIComponent(version)}`;
  const res = await fetch(url, {
    dispatcher,
    signal: anySignal([deadline, AbortSignal.timeout(METADATA_TIMEOUT_MS)]),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined);
    throw new NativeDownloadError(`HTTP ${res.status}`);
  }
  const manifest = (await res.json()) as {
    dist?: { tarball?: unknown; integrity?: unknown };
  };
  const tarball = manifest.dist?.tarball;
  const integrity = manifest.dist?.integrity;
  if (typeof tarball !== 'string' || typeof integrity !== 'string') {
    throw new NativeDownloadError('the registry returned no tarball');
  }
  // The integrity hash protects the contents; still refuse to downgrade an
  // HTTPS registry to a plain-HTTP tarball.
  const protocol = new URL(tarball).protocol;
  if (protocol !== 'https:' && protocol !== new URL(registry).protocol) {
    throw new NativeDownloadError('the registry returned an insecure tarball');
  }
  return { tarball, integrity: sha512Of(integrity) };
}

/** The base64 sha512 digest from an SRI string such as `sha512-abc==`. */
function sha512Of(integrity: string): string {
  const digest = integrity
    .split(/\s+/)
    .find(entry => entry.startsWith('sha512-'))
    ?.slice('sha512-'.length);
  if (!digest) {
    throw new NativeDownloadError('the registry returned no sha512 hash');
  }
  return digest;
}

async function downloadVerified({
  url,
  integrity,
  destination,
  dispatcher,
  deadline,
  onProgress,
}: {
  url: string;
  integrity: string;
  destination: string;
  dispatcher?: FetchDispatcher;
  deadline: AbortSignal;
  onProgress: (bytes: number) => void;
}): Promise<void> {
  const stalled = new AbortController();
  let stallTimer = setTimeout(() => stalled.abort(), STALL_TIMEOUT_MS);
  const signal = anySignal([deadline, stalled.signal]);
  try {
    const res = await fetch(url, { dispatcher, signal });
    if (!res.ok || !res.body) {
      void res.body?.cancel().catch(() => undefined);
      throw new NativeDownloadError(`HTTP ${res.status}`);
    }
    const hash = createHash('sha512');
    let bytes = 0;
    let reportedAt = Date.now();
    const meter = new Transform({
      transform(chunk: Uint8Array, _encoding, callback) {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => stalled.abort(), STALL_TIMEOUT_MS);
        hash.update(chunk);
        bytes += chunk.length;
        if (Date.now() - reportedAt >= PROGRESS_INTERVAL_MS) {
          reportedAt = Date.now();
          onProgress(bytes);
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      toNodeReadable(res.body),
      meter,
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
      { signal }
    );
    if (hash.digest('base64') !== integrity) {
      throw new NativeDownloadError('checksum mismatch');
    }
  } finally {
    clearTimeout(stallTimer);
  }
}

/** Refuse a binary that can't run here, such as one built for another libc. */
function checkStarts(binary: string): void {
  const result = spawnSync(binary, ['--version'], {
    stdio: 'ignore',
    timeout: START_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new NativeDownloadError("the binary didn't start");
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

function describeError(error: unknown, deadline: AbortSignal): string {
  const err = error as
    | { name?: string; code?: unknown; cause?: { code?: unknown } }
    | undefined;
  if (
    deadline.aborted ||
    err?.name === 'AbortError' ||
    err?.name === 'TimeoutError'
  ) {
    return 'timed out';
  }
  const code = err?.cause?.code ?? err?.code;
  return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)
    ? code
    : 'unexpected error';
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}
