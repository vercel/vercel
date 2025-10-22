export const version = 2;
import { BuildV2, NodejsLambda } from '@vercel/build-utils';
import { downloadInstallAndBundle } from './utils.js';
import { introspectApp } from './introspection/index.js';
import { nodeFileTrace } from './node-file-trace.js';
import { relative, join } from 'path';
import { doBuild } from './build.js';

export const build: BuildV2 = async args => {
  console.log(`Using experimental build`);

  const downloadResult = await downloadInstallAndBundle(args);

  const outputConfig = await doBuild(args, downloadResult);

  const { files } = await nodeFileTrace(args, outputConfig);

  const { routes, framework } = await introspectApp(args, {
    ...outputConfig,
    files,
  });

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
    framework,
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
