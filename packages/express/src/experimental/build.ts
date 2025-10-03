export const version = 2;
import { BuildV2, NodejsLambda } from '@vercel/build-utils';
import { downloadInstallAndBundle, maybeExecBuildCommand } from './utils';
import { rolldown } from './rolldown';
import { entrypointCallback } from './find-entrypoint';
import { introspectApp } from './introspection';

export const build: BuildV2 = async args => {
  console.log(`Using experimental express build`);
  const downloadResult = await downloadInstallAndBundle(args);

  await maybeExecBuildCommand(args, downloadResult);

  args.entrypoint = await entrypointCallback(args);

  const rolldownResult = await rolldown(args);

  const { routes } = await introspectApp(args, rolldownResult);

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

  return {
    routes,
    output,
  };
};
