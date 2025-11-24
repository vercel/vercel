import { downloadInstallAndBundle } from './utils.js';
import { introspectApp } from '@vercel/introspection';
import { nodeFileTrace } from './node-file-trace.js';
import { relative, join } from 'node:path';
import { doBuild } from './build.js';
import {
  defaultCachePathGlob,
  glob,
  NodejsLambda,
  debug,
  type PrepareCache,
  type BuildV2,
} from '@vercel/build-utils';

export const version = 2;

export const build: BuildV2 = async args => {
  const downloadResult = await downloadInstallAndBundle(args);

  const outputConfig = await doBuild(args, downloadResult);

  const { files } = await nodeFileTrace(args, downloadResult, outputConfig);

  debug('Building route mapping..');
  const { routes, framework } = await introspectApp({
    ...outputConfig,
    framework: args.config.framework,
    env: {
      ...(args.meta?.env ?? {}),
      ...(args.meta?.buildEnv ?? {}),
    },
  });
  if (routes.length > 2) {
    debug(`Route mapping built successfully with ${routes.length} routes`);
  } else {
    debug(`Route mapping failed to detect routes`);
  }

  const handler = relative(
    args.repoRootPath,
    join(outputConfig.dir, outputConfig.handler)
  );

  const lambda = new NodejsLambda({
    runtime: downloadResult.nodeVersion.runtime,
    handler,
    files,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: true,
    framework: {
      slug: framework?.slug ?? '',
      version: framework?.version ?? '',
    },
    awsLambdaHandler: '',
  });

  const output: Record<string, NodejsLambda> = { index: lambda };

  for (const route of routes) {
    if (route.dest) {
      if (route.dest === '/') {
        continue;
      }
      output[route.dest] = lambda;
    }
  }

  // Don't return until the TypeScript compilation is complete
  if (outputConfig.tsPromise) {
    await outputConfig.tsPromise;
  }

  return {
    routes,
    output,
  };
};

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};
