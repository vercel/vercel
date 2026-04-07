import {
  getLambdaPreloadScripts,
  type BytecodeCachingOptions,
} from './get-lambda-preload-scripts';

interface LambdaLike {
  awsLambdaHandler?: string;
  launcherType?: string;
  runtime: string;
  shouldAddHelpers?: boolean;
  shouldAddSourcemapSupport?: boolean;
  useWebApi?: boolean;
  shouldDisableAutomaticFetchInstrumentation?: boolean;
}

/**
 * Extract system environment variables that need to be injected in the Lambda.
 * Buffer is required just to determine if Bytecode Caching should be enabled
 * but it doesn't need to be super precise.
 */
export function getLambdaEnvironment(
  lambda: LambdaLike,
  buffer: { byteLength: number },
  options: BytecodeCachingOptions
) {
  const environment: Record<string, string> = {};

  if ('launcherType' in lambda && lambda.launcherType === 'Nodejs') {
    /**
     * For rusty-runtime, we can't use these lambda options at build time because
     * we no longer inject any launcher. Instead, we can forward these options
     * as environment variables to make them available at runtime.
     *
     * **DON'T FORGET TO UPDATE** `packages/util-env-variable/src/validate-env-length.ts
     * when adding or updating environment variables here.
     */
    if (lambda.awsLambdaHandler) {
      environment.AWS_LAMBDA_HANDLER = lambda.awsLambdaHandler;
    }

    /**
     * Instruct the runtime to add helpers to the user's code so that i.e.
     * the request has a `query` property that is a parsed URL query string.
     */
    if (lambda.shouldAddHelpers) {
      environment.VERCEL_SHOULD_ADD_HELPERS = '1';
    }

    /**
     * When `useWebApi` is true, the runtime should assume that the default
     * export of the entrypoint is a function that accepts a `Request` and
     * returns a `Response`.
     *
     * https://github.com/vercel/vercel/pull/12873
     */
    if (lambda.useWebApi === true) {
      environment.VERCEL_USE_WEB_API = '1';
    }

    /**
     * When `shouldAddSourcemapSupport` is true, we should map into an env
     * variable to be used at runtime.
     */
    if (lambda.shouldAddSourcemapSupport) {
      environment.VERCEL_SOURCE_MAP = '1';
    }

    /**
     * Instruct rusty-runtime to disable the automatic fetch instrumentation
     * in order to avoid duplicate instrumentation of the HTTP requests.
     */
    if (lambda.shouldDisableAutomaticFetchInstrumentation) {
      environment.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION = '1';
    }

    /**
     * Generate an environment variable that contains a comma-separated list
     * of scripts to preload before the user's code.
     */
    const scripts = getLambdaPreloadScripts(lambda, buffer, options);
    if (scripts.length > 0) {
      environment.VERCEL_NODE_PRELOAD_SCRIPTS = scripts.join(',');
    }
  }

  return environment;
}
