export const version = 2;
import { BuildV2, NodejsLambda, debug } from '@vercel/build-utils';
import { downloadInstallAndBundle, maybeExecBuildCommand } from './utils';
import { entrypointCallback } from './find-entrypoint';
import { introspectApp } from './introspection';
import { nodeFileTrace } from './node-file-trace';
import { build as cervelBuild } from 'cervel-beta';

export const build: BuildV2 = async args => {
  console.log(`Using experimental express build`);

  debug('[@vercel/express] Downloading and installing dependencies...');
  const downloadResult = await downloadInstallAndBundle(args);

  debug('[@vercel/express] Running build command...');
  await maybeExecBuildCommand(args, downloadResult);

  args.entrypoint = await entrypointCallback(args);

  const { rolldownResult, tsPromise } = await cervelBuild({
    ...args,
    cwd: args.workPath,
  });

  const { files } = await nodeFileTrace(args, rolldownResult);

  debug('[@vercel/express] Introspecting app...');
  const { routes } = await introspectApp(args, { ...rolldownResult, files });
  debug(`[@vercel/express] Found ${routes.length} routes`);

  const lambda = new NodejsLambda({
    runtime: downloadResult.nodeVersion.runtime,
    ...rolldownResult,
    files,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: true,
    framework: {
      slug: 'express',
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

  await tsPromise;

  return {
    routes,
    output,
  };
};
