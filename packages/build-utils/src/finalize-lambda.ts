import type { Lambda } from './lambda';
import type { NodejsLambda } from './nodejs-lambda';
import type { BytecodeCachingOptions } from './process-serverless/get-lambda-preload-scripts';
import type { SupportsStreamingResult } from './process-serverless/get-lambda-supports-streaming';
import { getEncryptedEnv } from './process-serverless/get-encrypted-env-file';
import { getLambdaEnvironment } from './process-serverless/get-lambda-environment';
import { getLambdaSupportsStreaming } from './process-serverless/get-lambda-supports-streaming';
import { sha256 } from './fs/stream-to-digest-async';
import { collectUncompressedSize } from './collect-uncompressed-size';

/**
 * Optional wrapper around async work, allowing callers to inject tracing
 * (e.g. dd-trace spans) without coupling the shared code to a tracer.
 */
export type TraceFn = <T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
) => Promise<T>;

const defaultTrace: TraceFn = (_name, fn) => fn();

/**
 * Result of a custom ZIP creation strategy.
 */
export interface CreateZipResult {
  /** The zip as a Buffer (in-memory), or null for disk-based paths. */
  buffer: Buffer | null;
  /** Path to the zip file on disk, or undefined for in-memory. */
  zipPath?: string;
  /** SHA-256 hex digest of the zip contents. */
  digest: string;
  /** Compressed size in bytes. */
  size: number;
}

/**
 * Custom ZIP creation strategy. When provided, replaces the default
 * in-memory `lambda.createZip()` + `sha256()` path. This allows callers
 * to stream large zips to disk instead.
 */
export type CreateZipFn = (
  lambda: Lambda | NodejsLambda
) => Promise<CreateZipResult>;

export interface FinalizeLambdaParams {
  lambda: Lambda | NodejsLambda;
  encryptedEnvFilename?: string;
  encryptedEnvContent?: string;
  bytecodeCachingOptions: BytecodeCachingOptions;
  forceStreamingRuntime: boolean;
  /** When true, collect the uncompressed size of lambda files before zipping. */
  enableUncompressedLambdaSizeCheck?: boolean;
  /** Optional tracing wrapper for `collectUncompressedSize` and `createZip`. */
  trace?: TraceFn;
  /** Custom ZIP creation strategy. Defaults to in-memory lambda.createZip(). */
  createZip?: CreateZipFn;
  /**
   * Called after ZIP creation but before digest/environment/streaming.
   * Throw to abort (e.g. size validation). For the default in-memory path,
   * this runs before sha256.
   */
  validateZip?: (zip: {
    buffer: Buffer | null;
    zipPath?: string;
    size: number;
  }) => void;
}

export interface FinalizeLambdaResult {
  /** The zip as a Buffer, or null when a custom createZip returns a disk path. */
  buffer: Buffer | null;
  /** Path to zip on disk (set by custom createZip), null for in-memory. */
  zipPath: string | null;
  /** SHA-256 hex digest. */
  digest: string;
  /** Compressed size in bytes. */
  size: number;
  uncompressedBytes: number;
  /** Non-fatal streaming detection error, if any. Caller decides how to log. */
  streamingError?: SupportsStreamingResult['error'];
}

/**
 * Core Lambda finalization logic shared between BYOF and build-container.
 *
 * This function:
 * 1. Injects encrypted env file into lambda.files when provided
 * 2. Collects uncompressed size when enabled
 * 3. Creates the ZIP (in-memory or via custom strategy)
 * 4. Runs optional validateZip hook (e.g. size check)
 * 5. Computes SHA-256 digest (default path only; custom path provides its own)
 * 6. Merges environment variables (bytecode caching, helpers, etc.)
 * 7. Detects streaming support
 *
 * Note: This function mutates the `lambda` (files, environment,
 * supportsResponseStreaming).
 */
export async function finalizeLambda(
  params: FinalizeLambdaParams
): Promise<FinalizeLambdaResult> {
  const {
    lambda,
    encryptedEnvFilename,
    encryptedEnvContent,
    bytecodeCachingOptions,
    forceStreamingRuntime,
    enableUncompressedLambdaSizeCheck,
    trace = defaultTrace,
    createZip: createZipOverride,
    validateZip,
  } = params;

  // 1. Encrypted env injection
  const encryptedEnv = getEncryptedEnv(
    encryptedEnvFilename,
    encryptedEnvContent
  );
  if (encryptedEnv) {
    const [envFilename, envFile] = encryptedEnv;
    lambda.zipBuffer = undefined;
    lambda.files = {
      ...lambda.files,
      [envFilename]: envFile,
    };
  }

  // 2. Uncompressed size collection
  let uncompressedBytes = 0;
  if (enableUncompressedLambdaSizeCheck) {
    if (lambda.files) {
      uncompressedBytes = await trace('collectUncompressedSize', () =>
        collectUncompressedSize(lambda.files ?? {})
      );
    }
  }

  // 3. ZIP creation (pluggable strategy)
  const zipTags: Record<string, string> = {
    fileCount: String(Object.keys(lambda.files ?? {}).length),
    uncompressedBytes: String(uncompressedBytes),
  };

  let zipResult: CreateZipResult;
  if (createZipOverride) {
    // Custom path (e.g. file-based): digest already computed by callback
    zipResult = await trace(
      'createZip',
      () => createZipOverride(lambda),
      zipTags
    );
  } else {
    // Default in-memory path: create buffer first, digest deferred to step 5
    const buffer =
      lambda.zipBuffer ||
      (await trace('createZip', () => lambda.createZip(), zipTags));
    zipResult = {
      buffer,
      digest: '', // computed in step 5
      size: buffer.byteLength,
    };
  }

  // 4. Optional validation (e.g. size check)
  if (validateZip) {
    validateZip({
      buffer: zipResult.buffer,
      zipPath: zipResult.zipPath,
      size: zipResult.size,
    });
  }

  // 5. Digest (deferred for default path so validateZip can abort first)
  if (!createZipOverride && zipResult.buffer) {
    zipResult.digest = sha256(zipResult.buffer);
  }

  // 6. Lambda environment
  lambda.environment = {
    ...lambda.environment,
    ...getLambdaEnvironment(
      lambda,
      zipResult.buffer ?? { byteLength: zipResult.size },
      bytecodeCachingOptions
    ),
  };

  // 7. Streaming detection
  const streamingResult = await getLambdaSupportsStreaming(
    lambda,
    forceStreamingRuntime
  );
  lambda.supportsResponseStreaming = streamingResult.supportsStreaming;

  return {
    buffer: zipResult.buffer,
    zipPath: zipResult.zipPath ?? null,
    digest: zipResult.digest,
    size: zipResult.size,
    uncompressedBytes,
    streamingError: streamingResult.error,
  };
}
