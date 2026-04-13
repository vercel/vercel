export interface BytecodeCachingOptions {
  vercelEnv: string | undefined;
  useBytecodeCaching: string | undefined;
  useNativeBytecodeCaching: string | undefined;
  bytecodeCachingThreshold: string | undefined;
}

interface LambdaLike {
  framework?: { slug: string };
  runtime: string;
  shouldAddSourcemapSupport?: boolean;
}

/**
 * Returns an array of scripts that should be preloaded in Node.js Lambdas.
 * The `buffer` parameter is needed to decide wether or not to enable Bytecode
 * Caching so it doesn't **need** to be exact (we can leave out the env layer)
 */
export function getLambdaPreloadScripts(
  lambda: LambdaLike,
  buffer: { byteLength: number },
  options: BytecodeCachingOptions
) {
  const scripts: string[] = [];

  /**
   * TODO: remove from the nodePreloadScripts array once rusty is fully
   * released with support VERCEL_SOURCE_MAP
   */
  if (lambda.shouldAddSourcemapSupport) {
    scripts.push('/opt/rust/source-map-support.js');
  }

  /**
   * Defines the minimum size of the lambda zip to enable bytecode
   * caching. The default value is 400KB.
   */
  const BYTECODE_MIN_SIZE_BYTES =
    (Number.parseInt(options.bytecodeCachingThreshold || '', 10) || 400) * 1024;

  /**
   * Only enable Bytecode Caching when:
   *   - The feature flag is enabled.
   *   - The deployment is targeting production.
   *   - The lambda is using Node.js 20, 22 or 24
   *   - The lambda zip is larger than the minimum size.
   */
  if (
    options.vercelEnv === 'production' &&
    options.useBytecodeCaching === '1' &&
    ['nodejs20.x', 'nodejs22.x', 'nodejs24.x'].includes(lambda.runtime) &&
    buffer.byteLength >= BYTECODE_MIN_SIZE_BYTES
  ) {
    scripts.push(
      ['nodejs22.x', 'nodejs24.x'].includes(lambda.runtime) &&
        options.useNativeBytecodeCaching === '1'
        ? '/opt/rust/bytecode-native.js'
        : '/opt/rust/bytecode.js'
    );
  }

  /**
   * Inject a fetch cache handler in the runtime in Next.js lambdas.
   * x-ref: https://github.com/vercel/edge-functions/pull/1879
   */
  if (lambda.framework?.slug === 'nextjs') {
    scripts.push('/opt/rust/next-data.js');
  }

  return scripts;
}
