export const version = 2;
import { BuildV2, NodejsLambda } from '@vercel/build-utils';
import { downloadInstallAndBundle } from './utils';
import { introspectApp } from './introspection';
import { nodeFileTrace } from './node-file-trace';
import { relative, join } from 'path';
import { doBuild } from './build';

export const build: BuildV2 = async args => {
  console.log(`Using experimental express build`);

  const downloadResult = await downloadInstallAndBundle(args);

  const outputConfig = await doBuild(args, downloadResult);

  const { files } = await nodeFileTrace(args, outputConfig);
  const { routes } = await introspectApp(args, { ...outputConfig, files });

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
