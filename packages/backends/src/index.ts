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
  getNodeVersion,
  Span,
} from '@vercel/build-utils';

export const version = 2;

export const build: BuildV2 = async args => {
  const downloadResult = await downloadInstallAndBundle(args);
  const nodeVersion = await getNodeVersion(args.workPath);
  const builderName = '@vercel/backends';

  const span =
    args.span ??
    new Span({
      name: builderName,
    });

  span.setAttributes({
    'builder.name': builderName,
  });

  const doBuildSpan = span.child('vc.builder.backends.doBuild');
  const outputConfig = await doBuildSpan.trace(async span => {
    const result = await doBuild(args, downloadResult);
    span.setAttributes({
      'outputConfig.dir': result.dir,
      'outputConfig.handler': result.handler,
    });
    return result;
  });

  debug('Node file trace starting..');
  // const nftSpan = span.child('vc.builder.backends.nodeFileTrace');
  // const nftPromise = nftSpan.trace(() =>
  //   nodeFileTrace(args, nodeVersion, outputConfig)
  // );
  debug('Introspection starting..');
  const introspectAppSpan = span.child('vc.builder.backends.introspectApp');
  const { routes, framework } = await introspectAppSpan.trace(async span => {
    const result = await introspectApp({
      ...outputConfig,
      framework: args.config.framework,
      env: {
        ...(args.meta?.env ?? {}),
        ...(args.meta?.buildEnv ?? {}),
      },
    });
    span.setAttributes({
      'introspectApp.routes': String(result.routes.length),
    });
    return result;
  });

  if (routes.length > 2) {
    debug(`Introspection completed successfully with ${routes.length} routes`);
  } else {
    debug(`Introspection failed to detect routes`);
  }

  const handler = relative(
    args.repoRootPath,
    join(outputConfig.dir, outputConfig.handler)
  );

  const files = {};
  // const { files } = await nftPromise;
  debug('Node file trace complete');

  const lambda = new NodejsLambda({
    runtime: nodeVersion.runtime,
    handler,
    files,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: true,
    framework: {
      slug: framework?.slug ?? '',
      version: framework?.version ?? '',
    },
    awsLambdaHandler: '',
    shouldDisableAutomaticFetchInstrumentation:
      process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION ===
      '1',
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
    const tsSpan = span.child('vc.builder.backends.tsCompile');
    await tsSpan.trace(() => outputConfig.tsPromise);
  }

  return {
    routes,
    output,
  };
};

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};
