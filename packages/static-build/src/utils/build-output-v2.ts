import path from 'path';
import { pathExists } from 'fs-extra';
import { promises as fs } from 'fs';
import { Route } from '@vercel/routing-utils';
import {
  Files,
  FileFsRef,
  debug,
  glob,
  EdgeFunction,
} from '@vercel/build-utils';
import { isObjectEmpty } from './_shared';

const BUILD_OUTPUT_DIR = '.output';

/**
 * Returns the path to the Build Output API v2 directory when the
 * `config.json` file was created by the framework / build script,
 * or `undefined` if the framework did not create the v3 output.
 */
export async function getBuildOutputDirectory(
  workingDir: string
): Promise<string | undefined> {
  try {
    const outputDir = path.join(workingDir, BUILD_OUTPUT_DIR);
    await pathExists(outputDir);
    return outputDir;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
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
  const middlewareRelativePath = path.join(
    BUILD_OUTPUT_DIR,
    'server/pages/_middleware.js'
  );
  const middlewareAbsolutePath = path.join(workPath, middlewareRelativePath);

  const fileExists = await fs.stat(middlewareAbsolutePath);
  if (!fileExists) {
    return;
  }

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
