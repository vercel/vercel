interface LambdaLike {
  awsLambdaHandler?: string;
  handler: string;
  launcherType?: string;
  runtime: string;
  supportsResponseStreaming?: boolean;
}

/**
 * Determines if a Lambda should have streaming enabled.
 *
 * AWS custom handlers cannot stream — the handler contract returns a
 * response object, not a stream — so they always resolve to `false`,
 * even when `forceStreamingRuntime` is set. This mirrors
 * `deserializeLambda`, which also refuses to force streaming on lambdas
 * with an `awsLambdaHandler` set.
 *
 * Otherwise: if `forceStreamingRuntime` is true, streaming is always
 * enabled. If the setting is defined it will be honored. Enabled by
 * default for Node.js.
 */
export function getLambdaSupportsStreaming(
  lambda: LambdaLike,
  forceStreamingRuntime: boolean
): boolean | undefined {
  if (lambda.awsLambdaHandler) {
    return false;
  }

  if (forceStreamingRuntime) {
    return true;
  }

  if (typeof lambda.supportsResponseStreaming === 'boolean') {
    return lambda.supportsResponseStreaming;
  }

  if ('launcherType' in lambda && lambda.launcherType === 'Nodejs') {
    return true;
  }

  return undefined;
}
