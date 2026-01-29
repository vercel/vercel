import { downloadInstallAndBundle } from './utils.js';
import { introspectApp } from './introspection/index.js';
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
import { findEntrypoint } from './cervel/index.js';

// Re-export cervel functions for use by other packages
export {
  build as cervelBuild,
  serve as cervelServe,
  findEntrypoint,
  nodeFileTrace,
  getBuildSummary,
  srvxOptions,
} from './cervel/index.js';
export type {
  CervelBuildOptions,
  CervelServeOptions,
  PathOptions,
} from './cervel/index.js';

// Re-export introspection functions
export { introspectApp } from './introspection/index.js';

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

  const entrypoint = await findEntrypoint(args.workPath);
  debug('Entrypoint', entrypoint);

  const buildSpan = span.child('vc.builder.backends.build');
  const introspectionSpan = span.child('vc.builder.backends.introspectApp');

  const [buildResult, introspectionResult] = await Promise.all([
    buildSpan.trace(() => doBuild(args, downloadResult, buildSpan)),
    introspectionSpan.trace(() =>
      introspectApp({
        handler: entrypoint,
        dir: args.workPath,
        framework: args.config.framework,
        env: {
          ...(args.meta?.env ?? {}),
          ...(args.meta?.buildEnv ?? {}),
        },
        span: introspectionSpan,
      })
    ),
  ]);

  const files = buildResult.files;

  const { routes, framework } = introspectionResult;

  if (routes.length > 2) {
    debug(`Introspection completed successfully with ${routes.length} routes`);
  } else {
    debug(`Introspection failed to detect routes`);
  }

  const handler = buildResult.handler;
  if (!files) {
    throw new Error('Unable to trace files for build');
  }

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
  if (buildResult.tsPromise) {
    const tsSpan = span.child('vc.builder.backends.tsCompile');
    await tsSpan.trace(() => buildResult.tsPromise);
  }

  return {
    routes,
    output,
  };
};

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};
