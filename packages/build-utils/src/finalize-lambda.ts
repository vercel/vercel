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
export type TraceFn = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

const defaultTrace: TraceFn = (_name, fn) => fn();

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
}

export interface FinalizeLambdaResult {
  buffer: Buffer;
  digest: string;
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
 * 3. Creates the ZIP buffer
 * 4. Computes SHA-256 digest
 * 5. Merges environment variables (bytecode caching, helpers, etc.)
 * 6. Detects streaming support
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

  // 3. ZIP creation
  const buffer =
    lambda.zipBuffer || (await trace('createZip', () => lambda.createZip()));

  // 4. Digest
  const digest = sha256(buffer);

  // 5. Lambda environment
  lambda.environment = {
    ...lambda.environment,
    ...getLambdaEnvironment(lambda, buffer, bytecodeCachingOptions),
  };

  // 6. Streaming detection
  const streamingResult = await getLambdaSupportsStreaming(
    lambda,
    forceStreamingRuntime
  );
  lambda.supportsResponseStreaming = streamingResult.supportsStreaming;

  return {
    buffer,
    digest,
    uncompressedBytes,
    streamingError: streamingResult.error,
  };
}
