import path from 'node:path';
import fs from 'fs-extra';
import { Route } from '@vercel/routing-utils';
import {
  Files,
  FileFsRef,
  debug,
  glob,
  EdgeFunction,
  BuildResultV2,
} from '@vercel/build-utils';
import { isObjectEmpty } from './_shared.js';
import { Project } from 'ts-morph';
import { getConfig } from '@vercel/static-config';
import { isErrnoException } from '@vercel/error-utils';

const { pathExists, readJson, appendFile } = fs;
const BUILD_OUTPUT_DIR = '.output';
const BRIDGE_MIDDLEWARE_V2_TO_V3 = `


// appended to convert v2 middleware to v3 middleware
export default async (request) => {
  const { response } = await _ENTRIES['middleware_pages/_middleware'].default({ request });
  return response;
}
`;

const CONFIG_FILES = [
  'build-manifest.json',
  'functions-manifest.json',
  'images-manifest.json',
  'prerender-manifest.json',
  'routes-manifest.json',
];

/**
 * Returns the path to the Build Output API v2 directory when any
 * relevant config file was created by the framework / build script,
 * or `undefined` if the framework did not create the v2 output.
 */
export async function getBuildOutputDirectory(
  workingDir: string
): Promise<string | undefined> {
  const outputDir = path.join(workingDir, BUILD_OUTPUT_DIR);

  // check for one of several config files
  const finderPromises = CONFIG_FILES.map(configFile => {
    return pathExists(path.join(outputDir, configFile));
  });

  const finders = await Promise.all(finderPromises);
  if (finders.some(found => found)) {
    return outputDir;
  }
  return undefined;
}

/**
 * Reads the BUILD_OUTPUT_DIR directory and returns and object
 * that should be merged with the build outputs.
 */
export async function readBuildOutputDirectory({
  workPath,
}: {
  workPath: string;
}) {
  // Functions are not supported, but are used to support Middleware
  const functions: Record<string, EdgeFunction> = {};

  // Routes are not supported, but are used to support Middleware
  const routes: Array<Route> = [];

  const middleware = await getMiddleware(workPath);
  if (middleware) {
    routes.push(middleware.route);

    functions['middleware'] = new EdgeFunction({
      deploymentTarget: 'v8-worker',
      entrypoint: '_middleware.js',
      files: {
        '_middleware.js': middleware.file,
      },
      name: 'middleware',
      regions: (() => {
        try {
          const project = new Project();
          const config = getConfig(project, middleware.file.fsPath);
          return config?.regions;
        } catch (err) {
          return undefined;
        }
      })(),
    });
  }

  const staticFiles = await readStaticFiles({ workPath });

  const outputs = {
    staticFiles: isObjectEmpty(staticFiles) ? null : staticFiles,
    functions: isObjectEmpty(functions) ? null : functions,
    routes: routes.length ? routes : null,
  };

  if (outputs.functions) {
    debug(`Detected Serverless Functions in "${BUILD_OUTPUT_DIR}"`);
  }

  if (outputs.staticFiles) {
    debug(`Detected Static Assets in "${BUILD_OUTPUT_DIR}"`);
  }

  if (outputs.routes) {
    debug(`Detected Routes Configuration in "${BUILD_OUTPUT_DIR}"`);
  }

  return outputs;
}

async function getMiddleware(
  workPath: string
): Promise<{ route: Route; file: FileFsRef } | undefined> {
  const manifestPath = path.join(
    workPath,
    BUILD_OUTPUT_DIR,
    'functions-manifest.json'
  );

  try {
    const manifest = await readJson(manifestPath);
    if (manifest.pages['_middleware.js'].runtime !== 'web') {
      return;
    }
  } catch (error: unknown) {
    if (!isErrnoException(error)) {
      throw error;
    }
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const middlewareRelativePath = path.join(
    BUILD_OUTPUT_DIR,
    'server/pages/_middleware.js'
  );

  const middlewareAbsoluatePath = path.join(workPath, middlewareRelativePath);
  await appendFile(middlewareAbsoluatePath, BRIDGE_MIDDLEWARE_V2_TO_V3);

  const route = {
    src: '/(.*)',
    middlewarePath: 'middleware',
    continue: true,
  };

  return {
    route,
    file: new FileFsRef({
      fsPath: middlewareRelativePath,
    }),
  };
}

async function readStaticFiles({
  workPath,
}: {
  workPath: string;
}): Promise<Files> {
  const staticFilePath = path.join(workPath, BUILD_OUTPUT_DIR, 'static');
  const staticFiles = await glob('**', {
    cwd: staticFilePath,
  });

  return staticFiles;
}

export async function createBuildOutput(
  workPath: string
): Promise<BuildResultV2> {
  let output: Files = {};
  const routes: Route[] = [];

  const extraOutputs = await readBuildOutputDirectory({
    workPath,
  });

  if (extraOutputs.routes) {
    routes.push(...extraOutputs.routes);
  }

  if (extraOutputs.staticFiles) {
    output = Object.assign(
      {},
      extraOutputs.staticFiles,
      extraOutputs.functions
    );
  }

  return { routes, output };
}
