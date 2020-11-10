import { FileBlob, Files, Lambda } from '@vercel/build-utils';
import { getTransformedRoutes, Route } from '@vercel/routing-utils';
import { makeNowLauncher } from '../launcher';
import { promises as fs } from 'fs';
import buildUtils from '../build-utils';
import path from 'path';
import { isObjectEmpty } from './_shared';

const { createLambda, debug, getLatestNodeVersion, glob } = buildUtils;

/**
 * TODO: Update.
 * Reads the .vercel_build_output directory and returns and object
 * that should be merged with the build outputs.
 *
 * At the moment only `functions/node` is supported.
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

  return {
    staticFiles: isObjectEmpty(staticFiles) ? null : staticFiles,
    functions: isObjectEmpty(functions) ? null : functions,
    routes: routes.length ? routes : null,
  };
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
    const rawRoutes = JSON.parse(await fs.readFile(routesConfigPath, 'utf8'));
    const { routes, error } = getTransformedRoutes({ nowConfig: rawRoutes });

    if (error) {
      throw error;
    }

    return routes || [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
