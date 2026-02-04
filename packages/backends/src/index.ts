import { downloadInstallAndBundle } from './utils.js';
import {
  defaultCachePathGlob,
  glob,
  NodejsLambda,
  debug,
  getNodeVersion,
  Span,
  type PrepareCache,
  type BuildV2,
  type Lambda,
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
import { maybeDoBuildCommand } from './build.js';
import { typescript } from './typescript.js';

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

  const buildSpan = span.child('vc.builder.backends.build');

  return buildSpan.trace(async () => {
    const entrypoint = await findEntrypoint(args.workPath);
    debug('Entrypoint', entrypoint);
    args.entrypoint = entrypoint;

    const typescriptPromise = typescript({
      entrypoint,
      workPath: args.workPath,
      span: buildSpan,
    });
    // Always run rolldown, even if the user has provided a build command
    // It's very fast and we use it for introspection.
    const rolldownResult = await rolldown({
      ...args,
      span: buildSpan,
    });

    const introspectionPromise = introspection({
      ...args,
      span: buildSpan,
      files: rolldownResult.files,
      handler: rolldownResult.handler,
    });

    const userBuildResult = await maybeDoBuildCommand(args, downloadResult);
    const localBuildFiles =
      userBuildResult?.localBuildFiles.size > 0
        ? userBuildResult?.localBuildFiles
        : rolldownResult.localBuildFiles;

    const files = userBuildResult?.files || rolldownResult.files;
    const handler = userBuildResult?.handler || rolldownResult.handler;
    const nftWorkPath = userBuildResult?.outputDir || args.workPath;

    await nft({
      ...args,
      workPath: nftWorkPath,
      localBuildFiles,
      files,
      ignoreNodeModules: false,
      span: buildSpan,
    });
    const introspectionResult = await introspectionPromise;
    await typescriptPromise;

    const lambda = new NodejsLambda({
      runtime: nodeVersion.runtime,
      handler,
      files,
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

    const output: Record<string, Lambda> = { index: lambda };

    for (const route of routes) {
      if (route.dest) {
        if (route.dest === '/') {
          continue;
        }
        output[route.dest] = lambda;
      }
    }

    return {
      routes,
      output,
    };
  });
};

export const prepareCache: PrepareCache = ({ repoRootPath, workPath }) => {
  return glob(defaultCachePathGlob, repoRootPath || workPath);
};
