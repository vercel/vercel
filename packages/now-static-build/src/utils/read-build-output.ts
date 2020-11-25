import { FileBlob, Files, Lambda } from '@vercel/build-utils';
import { isObjectEmpty } from './_shared';
import { makeNowLauncher } from '../launcher';
import { promises as fs } from 'fs';
import { Route } from '@vercel/routing-utils';
import buildUtils from '../build-utils';
import path from 'path';

const { createLambda, debug, getLatestNodeVersion, glob } = buildUtils;

/**
 * Reads the .vercel_build_output directory and returns and object
 * that should be merged with the build outputs.
 *
 * At the moment only `functions/node` is supported for functions.
 */
export async function readBuildOutputDirectory({
  workPath,
}: {
  workPath: string;
}) {
  const functions: { [key: string]: Lambda } = {};
  const functionsMountPath = path.join('.vercel', 'functions');

  Object.assign(
    functions,
    await readNodeFunctions({ workPath, functionsMountPath })
  );
  const staticFiles = await readStaticFiles({ workPath });

  const routes = await readRoutesConfig({ workPath });

  const outputs = {
    staticFiles: isObjectEmpty(staticFiles) ? null : staticFiles,
    functions: isObjectEmpty(functions) ? null : functions,
    routes: routes.length ? routes : null,
  };

  if (outputs.functions) {
    console.log(
      `Detected Serverless Functions in ".vercel_build_output/functions"`
    );
  }

  if (outputs.staticFiles) {
    console.log(`Detected Static Assets in ".vercel_build_output/static"`);
  }

  if (outputs.routes) {
    console.log(`Detected Configuration in ".vercel_build_output/config"`);
  }

  return outputs;
}

async function readStaticFiles({
  workPath,
}: {
  workPath: string;
}): Promise<Files> {
  const staticFilePath = path.join(workPath, '.vercel_build_output', 'static');
  const staticFiles = await glob('**', {
    cwd: staticFilePath,
  });

  return staticFiles;
}

async function readNodeFunctions({
  workPath,
  functionsMountPath,
}: {
  workPath: string;
  functionsMountPath: string;
}) {
  const output: { [key: string]: Lambda } = {};
  const nodeFunctionPath = path.join(
    workPath,
    '.vercel_build_output',
    'functions',
    'node'
  );
  const nodeFunctionFiles = await glob('*/index.js', {
    cwd: nodeFunctionPath,
  });
  const nodeBridgeData = await fs.readFile(path.join(__dirname, 'bridge.js'));

  for (const fileName of Object.keys(nodeFunctionFiles)) {
    const launcherFileName = '___now_launcher';
    const bridgeFileName = '___now_bridge';

    const launcherFiles: Files = {
      [`${launcherFileName}.js`]: new FileBlob({
        data: makeNowLauncher({
          entrypointPath: `./index.js`,
          bridgePath: `./${bridgeFileName}`,
          helpersPath: '',
          sourcemapSupportPath: '',
          shouldAddHelpers: false,
          shouldAddSourcemapSupport: false,
        }),
      }),
      [`${bridgeFileName}.js`]: new FileBlob({
        data: nodeBridgeData,
      }),
    };

    const requiredFiles = await glob('**', {
      cwd: path.join(nodeFunctionPath, path.dirname(fileName)),
    });

    const lambda = await createLambda({
      files: {
        ...requiredFiles,
        ...launcherFiles,
      },
      handler: `${launcherFileName}.launcher`,
      runtime: getLatestNodeVersion().runtime,
    });

    const parsed = path.parse(fileName);
    const newPath = path.join(functionsMountPath, parsed.dir, parsed.name);
    output[newPath] = lambda;

    debug(
      `Created Lambda "${newPath}" from "${path.join(
        nodeFunctionPath,
        fileName
      )}".`
    );
  }

  return output;
}

async function readRoutesConfig({
  workPath,
}: {
  workPath: string;
}): Promise<Route[]> {
  const routesConfigPath = path.join(
    workPath,
    '.vercel_build_output',
    'config',
    'routes.json'
  );

  try {
    return JSON.parse(await fs.readFile(routesConfigPath, 'utf8')) || [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
