import { join } from 'path';
import { getFunctionLibsFiles, getHandler } from '../handlers/build';
import {
  FileBlob,
  FileFsRef,
  NodejsLambda,
  NodeVersion,
  Prerender,
} from '@vercel/build-utils/dist';

const getFunctionName = (route: string) => route.replace(/\/$/, '');

export async function createFunctionLambda({
  nodeVersion,
  handlerFile,
}: {
  nodeVersion: NodeVersion;
  handlerFile: string;
}) {
  return new NodejsLambda({
    handler: 'index.js',
    runtime: nodeVersion.runtime,
    shouldAddHelpers: true,
    shouldAddSourcemapSupport: false,
    files: {
      ...(await getFunctionLibsFiles()),
      'index.js': new FileBlob({
        data: await getHandler({
          nodeVersion,
          handlerFile,
        }),
      }),
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
}): Promise<Record<string, NodejsLambda | Prerender>> {
  const functions: Record<string, NodejsLambda | Prerender> = {};

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

  for (const ssrRoute of ssrRoutes) {
    functions[getFunctionName(ssrRoute)] = lambda;
  }

  if (dsgRoutes?.length > 0) {
    const prerenderLambda = new Prerender({
      lambda,
      expiration: false,
      fallback: null,
    });

    for (const dsgRoute of dsgRoutes) {
      functions[getFunctionName(dsgRoute)] = prerenderLambda;
    }
  }

  return functions;
}

export async function createAPIRoutes({
  functions,
  nodeVersion,
}: {
  functions: Record<string, FileFsRef>;
  nodeVersion: NodeVersion;
}): Promise<Record<string, NodejsLambda>> {
  const lambdas: Record<string, NodejsLambda> = {};

  for (const [key, { fsPath }] of Object.entries(functions)) {
    const trimmedKey = key.replace(/\.[^/.]+$/, '');

    lambdas[`api/${trimmedKey}`] = new NodejsLambda({
      handler: 'index.js',
      runtime: nodeVersion.runtime,
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: false,
      files: {
        'index.js': new FileBlob({
          data: await getHandler({
            nodeVersion,
            handlerFile: fsPath,
          }),
        }),
      },
    });
  }

  return lambdas;
}
