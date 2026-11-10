// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { Lambda, NodejsLambda } from '@vercel/build-utils';

export function getFunctionConfig(lambda: Lambda | NodejsLambda) {
  return {
    runtime: lambda.runtime,
    handler: lambda.handler,
    architecture: lambda.architecture,
    environment: Object.fromEntries(
      Object.entries(lambda.environment).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    ),
    ...('launcherType' in lambda && lambda.launcherType === 'Nodejs'
      ? {
          launcherType: lambda.launcherType,
          awsLambdaHandler: lambda.awsLambdaHandler,
          shouldAddHelpers: lambda.shouldAddHelpers,
          shouldAddSourcemapSupport: lambda.shouldAddSourcemapSupport,
          shouldDisableAutomaticFetchInstrumentation:
            lambda.shouldDisableAutomaticFetchInstrumentation,
          useWebApi: lambda.useWebApi,
        }
      : {}),
    memory: lambda.memory,
    affinity: lambda.affinity,
    maxConcurrency: lambda.maxConcurrency,
    maxDuration: lambda.maxDuration,
    regions: lambda.regions,
    functionFailoverRegions: lambda.functionFailoverRegions,
    supportsResponseStreaming: lambda.supportsResponseStreaming,
    framework: lambda.framework && { ...lambda.framework },
  };
}
