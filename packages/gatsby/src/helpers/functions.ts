import { join, sep } from 'path';
import { IGatsbyFunction } from 'gatsby/dist/redux/types';

import {
  getFunctionLibsFiles,
  getFunctionHTMLFiles,
  getHandler,
} from '../handlers/build';
import {
  FileBlob,
  NodejsLambda,
  NodeVersion,
  Prerender,
} from '@vercel/build-utils/dist';

export async function createFunctionLambda({ nodeVersion, handlerFile }) {
  return new NodejsLambda({
    handler: 'index.js',
    runtime: nodeVersion.runtime,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
    files: {
      'index.js': new FileBlob({
        data: await getHandler({
          nodeVersion,
          handlerFile,
        }),
      }),
      ...(await getFunctionLibsFiles()),
      ...(await getFunctionHTMLFiles()),
    },
  });
}

export async function createServerlessFunction({
  dsgRoutes,
  ssrRoutes,
  nodeVersion,
}: {
  dsgRoutes: string[];
  ssrRoutes: string[];
  nodeVersion: NodeVersion;
}) {
  const lambda = await createFunctionLambda({
    nodeVersion,
    handlerFile: join(
      __dirname,
      '..',
      'handlers',
      'templates',
      './ssr-handler'
    ),
  });

  const prerenderLambda =
    dsgRoutes?.length &&
    new Prerender({
      lambda,
      expiration: false,
      fallback: null,
    });

  const getFunctionName = route =>
    route.replace(/\/$/, '').split(sep).pop() as string;

  return {
    ...ssrRoutes.reduce((acc, ssrRoute) => {
      acc[getFunctionName(ssrRoute)] = lambda;
      return acc;
    }, {}),
    ...dsgRoutes?.reduce((acc, dsgRoute) => {
      acc[getFunctionName(dsgRoute)] = prerenderLambda;
      return acc;
    }, {}),
  };
}

export async function createAPIRoutes({
  functions,
  nodeVersion,
}: {
  functions: IGatsbyFunction[];
  nodeVersion: NodeVersion;
}) {
  return functions.reduce(async (acc, cur) => {
    const handlerFile = cur.originalAbsoluteFilePath;

    acc[cur.functionRoute] = new FileBlob({
      data: await getHandler({
        nodeVersion,
        handlerFile,
      }),
    });

    return acc;
  }, {});
}
