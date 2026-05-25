interface LambdaLike {
  awsLambdaHandler?: string;
  handler: string;
  launcherType?: string;
  runtime: string;
  supportsResponseStreaming?: boolean;
}

export interface SupportsStreamingResult {
  supportsStreaming: boolean | undefined;
  error?: { handler: string; message: string };
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
export async function getLambdaSupportsStreaming(
  lambda: LambdaLike,
  forceStreamingRuntime: boolean
): Promise<SupportsStreamingResult> {
  if (lambda.awsLambdaHandler) {
    return { supportsStreaming: false };
  }

  if (forceStreamingRuntime) {
    return { supportsStreaming: true };
  }

  if (typeof lambda.supportsResponseStreaming === 'boolean') {
    return { supportsStreaming: lambda.supportsResponseStreaming };
  }

  if ('launcherType' in lambda && lambda.launcherType === 'Nodejs') {
    return { supportsStreaming: true };
  }

  return { supportsStreaming: undefined };
}
