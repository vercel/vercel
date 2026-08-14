import { NowBuildError } from './errors';
import bytes from 'bytes';

/**
 * Max compressed ZIP size (300 MB).
 * Limit is 250 MB uncompressed; we set 300 MB compressed as a safety
 * buffer. Python is exempt because AI workloads commonly exceed this.
 */
export const MAX_LAMBDA_SIZE: number = bytes('300mb');

/**
 * Max uncompressed size (250 MB).
 */
export const MAX_LAMBDA_UNCOMPRESSED_SIZE = 250 * 1024 * 1024; // 250 MB

/**
 * Error thrown when a Lambda's compressed ZIP exceeds the allowed size.
 */
export class FunctionSizeError extends NowBuildError {
  size: number;
  maxSize: number;

  constructor(outputPath: string, size: number) {
    super({
      code: 'NOW_SANDBOX_WORKER_MAX_LAMBDA_SIZE',
      message: `The Vercel Function "${outputPath}" is ${bytes(
        size
      ).toLowerCase()} which exceeds the maximum size limit of ${bytes(
        MAX_LAMBDA_SIZE
      ).toLowerCase()}.`,
      link: 'https://vercel.link/serverless-function-size',
      action: 'Learn More',
    });
    this.size = size;
    this.maxSize = MAX_LAMBDA_SIZE;
  }
}

/**
 * Validates the compressed size of a Lambda function.
 * Python runtimes are exempt because AI workloads commonly exceed 300 MB.
 */
export function validateLambdaSize(
  outputPath: string,
  runtime: string,
  size: number
): void {
  if (runtime.startsWith('python')) {
    return;
  }
  if (size > MAX_LAMBDA_SIZE) {
    throw new FunctionSizeError(outputPath, size);
  }
}

/**
 * Validates the uncompressed size of a Lambda function.
 */
export function validateUncompressedLambdaSize(
  outputPath: string,
  uncompressedBytes: number
): void {
  if (uncompressedBytes >= MAX_LAMBDA_UNCOMPRESSED_SIZE) {
    throw new NowBuildError({
      code: 'NOW_SANDBOX_WORKER_MAX_UNCOMPRESSED_LAMBDA_SIZE',
      message: `The Vercel Function "${outputPath}" is ${bytes(
        uncompressedBytes
      ).toLowerCase()} uncompressed which exceeds the maximum uncompressed size limit of ${bytes(
        MAX_LAMBDA_UNCOMPRESSED_SIZE
      ).toLowerCase()}.`,
      link: 'https://vercel.link/serverless-function-size',
      action: 'Learn More',
    });
  }
}

/**
 * Runtimes that support env wrapper.
 */
export const ENV_WRAPPER_SUPPORTED_FAMILIES = [
  'nodejs',
  'python',
  'ruby',
  'java',
  'dotnetcore',
  'bun',
  'executable',
];

interface LambdaLikeForEnvWrapper {
  createZip?: () => Promise<Buffer>;
  runtime: string;
  supportsWrapper?: boolean;
}

/**
 * When the function requires a file for the encrypted environment variables,
 * it needs to support wrappers. Also, the function must have a `createZip`
 * function since we need to "re-compress" to include the file in the final
 * lambda.
 */
export function validateEnvWrapperSupport(
  encryptedEnvFilename: string | undefined,
  encryptedEnvContent: string | undefined,
  lambda: LambdaLikeForEnvWrapper
): void {
  if (!encryptedEnvFilename || !encryptedEnvContent) {
    return;
  }

  if (
    !lambda.supportsWrapper &&
    !ENV_WRAPPER_SUPPORTED_FAMILIES.some(family =>
      lambda.runtime.startsWith(family)
    )
  ) {
    throw new Error(
      `Serverless Function runtime ${lambda.runtime} does not support more than 4KB for environment variables`
    );
  }

  if (typeof lambda.createZip !== 'function') {
    throw new Error(
      `Serverless Function with runtime ${lambda.runtime} has no createZip function`
    );
  }
}
