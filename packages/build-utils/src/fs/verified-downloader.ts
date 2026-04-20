import { createHash, timingSafeEqual } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import { dirname } from 'path';
import nodeFetch, { Response as NodeFetchResponse } from 'node-fetch';
import { NowBuildError } from '../errors';

/**
 * Options for creating a {@link VerifiedDownloader}.
 */
export interface VerifiedDownloaderOptions {
  /**
   * The expected SHA-256 of the remote resource, as lowercase hex (64 chars).
   */
  sha256: string;
  /**
   * Maximum allowed response body size in bytes. Defaults to 500 MB. The
   * download is aborted with an error if the streamed bytes exceed this cap.
   */
  maxBytes?: number;
  /**
   * Per-request timeout in milliseconds. Defaults to 5 minutes.
   */
  timeoutMs?: number;
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Downloads a remote resource while streaming its bytes through a SHA-256
 * digest. Only writes the final destination file once the computed digest
 * matches the expected value using a constant-time comparison.
 *
 * Useful for fetching toolchain archives (Go, rustup, Bun, etc.) from CDNs
 * where integrity cannot be enforced by TLS alone.
 */
export class VerifiedDownloader {
  private readonly expectedSha256: string;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(options: VerifiedDownloaderOptions) {
    const {
      sha256,
      maxBytes = DEFAULT_MAX_BYTES,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options;

    if (typeof sha256 !== 'string' || !SHA256_HEX_RE.test(sha256)) {
      throw new NowBuildError({
        code: 'VERIFIED_DOWNLOADER_INVALID_SHA256',
        message:
          'VerifiedDownloader requires a lowercase 64-character hex SHA-256 digest.',
      });
    }
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new NowBuildError({
        code: 'VERIFIED_DOWNLOADER_INVALID_MAX_BYTES',
        message: 'VerifiedDownloader requires a positive maxBytes value.',
      });
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new NowBuildError({
        code: 'VERIFIED_DOWNLOADER_INVALID_TIMEOUT',
        message: 'VerifiedDownloader requires a positive timeoutMs value.',
      });
    }

    this.expectedSha256 = sha256;
    this.maxBytes = maxBytes;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Streams `url` to a temporary file while computing SHA-256, then renames
   * the temporary file to `destFile` only if the digest matches the expected
   * value. On mismatch (or any other failure) the partial file is removed and
   * a {@link NowBuildError} is thrown.
   *
   * @param url       The HTTP(S) URL to download from.
   * @param destFile  The absolute path to write to on success.
   */
  async downloadTo(url: string, destFile: string): Promise<void> {
    await fs.mkdir(dirname(destFile), { recursive: true });
    const tempFile = `${destFile}.${process.pid}.${Date.now()}.tmp`;

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    let streamedBytes = 0;
    let writer: ReturnType<typeof createWriteStream> | undefined;
    let res: NodeFetchResponse | undefined;

    try {
      // The AbortSignal shape on node-fetch's types lags the Node built-in;
      // the runtime accepts either so we cast to satisfy the compiler.
      res = await nodeFetch(url, {
        signal: abortController.signal as unknown as undefined,
      });
      if (!res.ok) {
        throw new NowBuildError({
          code: 'VERIFIED_DOWNLOADER_HTTP_ERROR',
          message: `Failed to download ${url}: ${res.status} ${res.statusText}`,
        });
      }

      const contentLengthHeader = res.headers.get('content-length');
      if (contentLengthHeader !== null) {
        const contentLength = Number.parseInt(contentLengthHeader, 10);
        if (Number.isFinite(contentLength) && contentLength > this.maxBytes) {
          throw new NowBuildError({
            code: 'VERIFIED_DOWNLOADER_TOO_LARGE',
            message: `Refusing to download ${url}: reported size ${contentLength} exceeds limit ${this.maxBytes}.`,
          });
        }
      }

      const hash = createHash('sha256');
      writer = createWriteStream(tempFile);

      const body = res.body;
      if (!body) {
        throw new NowBuildError({
          code: 'VERIFIED_DOWNLOADER_NO_BODY',
          message: `Response from ${url} had no body.`,
        });
      }

      const localWriter = writer;
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          body.removeListener('data', onData);
          body.removeListener('end', onEnd);
          body.removeListener('error', onError);
          localWriter.removeListener('error', onError);
          reject(err);
        };
        const onData = (chunk: Buffer) => {
          streamedBytes += chunk.length;
          if (streamedBytes > this.maxBytes) {
            abortController.abort();
            // Eagerly tear down the write handle so Windows can release the
            // underlying file lock before the outer `catch` tries to unlink.
            try {
              localWriter.destroy();
            } catch {
              // ignore
            }
            onError(
              new NowBuildError({
                code: 'VERIFIED_DOWNLOADER_TOO_LARGE',
                message: `Download of ${url} exceeded ${this.maxBytes} bytes.`,
              })
            );
            return;
          }
          hash.update(chunk);
          if (!localWriter.write(chunk)) {
            body.pause();
            localWriter.once('drain', () => body.resume());
          }
        };
        const onEnd = () => {
          localWriter.end(() => resolve());
        };
        body.on('data', onData);
        body.on('end', onEnd);
        body.on('error', onError);
        localWriter.on('error', onError);
      });

      const actualDigest = hash.digest();
      const expectedDigest = Buffer.from(this.expectedSha256, 'hex');
      if (
        actualDigest.length !== expectedDigest.length ||
        !timingSafeEqual(actualDigest, expectedDigest)
      ) {
        throw new NowBuildError({
          code: 'VERIFIED_DOWNLOADER_SHA256_MISMATCH',
          message: `SHA-256 mismatch downloading ${url}. Expected ${this.expectedSha256} but got ${actualDigest.toString(
            'hex'
          )}.`,
        });
      }

      // Atomic publish: rename temp file over the destination.
      await fs.rename(tempFile, destFile);
    } catch (err) {
      // Wait for any outstanding file handle / body stream to close before
      // attempting to remove the partial temp file. On Windows, `fs.rm`
      // rejects with EPERM when the target is still held open by our own
      // process, so we must release those handles first.
      await closeStreamQuietly(writer);
      await closeStreamQuietly(res?.body);
      try {
        await rmWithRetry(tempFile);
      } catch {
        // Leaving the tmp file behind is acceptable — the OS/tmp cleanup
        // will reclaim it. Never let cleanup mask the original error.
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function closeStreamQuietly(
  stream: NodeJS.WritableStream | NodeJS.ReadableStream | null | undefined
): Promise<void> {
  if (!stream) return;
  const s = stream as {
    destroyed?: boolean;
    destroy?: (err?: Error) => void;
    once?: (event: string, cb: () => void) => void;
  };
  if (s.destroyed) return;
  await new Promise<void>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      s.once?.('close', finish);
      s.once?.('error', finish);
    } catch {
      finish();
      return;
    }
    // Hard cap so we never hang if the stream misbehaves.
    const timer = setTimeout(finish, 250);
    if (typeof timer.unref === 'function') timer.unref();
    try {
      s.destroy?.();
    } catch {
      finish();
    }
  });
}

async function rmWithRetry(path: string): Promise<void> {
  // Windows filesystem handle release can lag a few ms behind `destroy()`.
  // Retry the unlink a handful of times on transient EPERM/EBUSY before
  // giving up. The total worst-case delay is 170 ms and only fires on the
  // already-error path, so happy-path perf is unaffected.
  const delays = [0, 20, 50, 100];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await new Promise(r => setTimeout(r, delays[i]));
    }
    try {
      await fs.rm(path, { force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') {
        throw err;
      }
      if (i === delays.length - 1) throw err;
    }
  }
}
