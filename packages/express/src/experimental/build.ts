export const version = 2;
import { BuildV2, NodejsLambda, debug } from '@vercel/build-utils';
import { downloadInstallAndBundle, maybeExecBuildCommand } from './utils';
import { rolldown } from './rolldown';
import { entrypointCallback } from './find-entrypoint';
import { introspectApp } from './introspection';
import { typescript } from './typescript';

export const build: BuildV2 = async args => {
  console.log(`Using experimental express build`);

  debug('[@vercel/express] Downloading and installing dependencies...');
  const downloadResult = await downloadInstallAndBundle(args);

  debug('[@vercel/express] Running build command...');
  await maybeExecBuildCommand(args, downloadResult);

  debug('[@vercel/express] Finding entrypoint...');
  args.entrypoint = await entrypointCallback(args);
  debug(`[@vercel/express] Entrypoint: ${args.entrypoint}`);

  debug('[@vercel/express] Compiling...');
  const { result: rolldownResult, cleanup } = await rolldown(args);

  debug('[@vercel/express] Type checking...');
  const tsPromise = typescript(args).catch(async () => {
    await cleanup();
  });

  debug('[@vercel/express] Introspecting app...');
  const { routes } = await introspectApp(args, rolldownResult);
  debug(`[@vercel/express] Found ${routes.length} routes`);

  const lambda = new NodejsLambda({
    runtime: downloadResult.nodeVersion.runtime,
    ...rolldownResult,
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
