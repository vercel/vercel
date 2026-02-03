import { downloadInstallAndBundle } from './utils.js';
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
import { rolldown } from './rolldown/index.js';
import { introspection } from './rolldown/introspection.js';
import { nft } from './rolldown/nft.js';

// Re-export introspection functions
export { introspectApp } from './introspection/index.js';

export const version = 2;

export const build: BuildV2 = async args => {
  await downloadInstallAndBundle(args);
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
  args.entrypoint = entrypoint;

  const rolldownResult = await rolldown({
    ...args,
    span,
  });
  const [introspectionResult] = await Promise.all([
    introspection({
      ...args,
      span,
      files: rolldownResult.files,
      handler: rolldownResult.handler,
    }),
    nft({
      ...args,
      localBuildFiles: rolldownResult.localBuildFiles,
      files: rolldownResult.files,
      ignoreNodeModules: false,
      span,
    }),
  ]);

  const lambda = new NodejsLambda({
    runtime: nodeVersion.runtime,
    handler: rolldownResult.handler,
    files: rolldownResult.files,
    framework: rolldownResult.framework,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: true,
    awsLambdaHandler: '',
    shouldDisableAutomaticFetchInstrumentation:
      process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION ===
      '1',
  });

  // Build routes: filesystem handler, then introspected routes, then catch-all
  const routes = [
    {
      handle: 'filesystem',
    },
    ...introspectionResult.routes,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  return {
    routes,
    output: { index: lambda },
  };
};

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};
