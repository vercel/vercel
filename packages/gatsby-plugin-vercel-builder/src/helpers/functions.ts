import { join } from 'path';
import { ensureDir } from 'fs-extra';
import { createSymlink } from '../utils/symlink';
import {
  writeHandler,
  writeVCConfig,
  copyFunctionLibs,
  copyHTMLFiles,
  writePrerenderConfig,
} from '../handlers/build';
import { GatsbyFunction } from '../schemas';
import { Routes } from '../types';

export async function createServerlessFunctions({
  dsgRoutes,
  ssrRoutes,
}: Routes) {
  /* Gatsby SSR/DSG on Vercel is enabled through Vercel Serverless Functions.
     This plugin creates one Serverless Function called `_ssr.func` that is used by SSR and DSG pages through symlinks.
     DSG is enabled through prerender functions.
  */
  const functionName = '_ssr.func';
  const functionDir = join('.vercel', 'output', 'functions', functionName);
  const handlerFile = join(
    __dirname,
    '..',
    'handlers',
    'templates',
    './ssr-handler.js'
  );

  await ensureDir(functionDir);

  await Promise.all([
    writeHandler({ outDir: functionDir, handlerFile }),
    copyFunctionLibs({ functionDir }),
    copyHTMLFiles({ functionDir }),
    writeVCConfig({ functionDir }),
  ]);

  await Promise.all([
    ...ssrRoutes.map(async pathName => {
      // HTML renderer
      const ssrPath = join(pathName, 'index.html');
      await createSymlink(ssrPath, functionName);

      // page-data renderer
      if (!pathName || pathName === '/') {
        pathName = 'index';
      }
      const pageDataPath = join('page-data', pathName, 'page-data.json');
      await createSymlink(pageDataPath, functionName);
    }),
    ...dsgRoutes.map(async (pathName, index) => {
      // HTML renderer
      const ssrPath = join(pathName, 'index.html');
      writePrerenderConfig(
        join(
          '.vercel',
          'output',
          'functions',
          `${ssrPath}.prerender-config.json`
        ),
        index + 1
      );
      await createSymlink(ssrPath, functionName);

      // page-data renderer
      if (!pathName || pathName === '/') {
        pathName = 'index';
      }
      const pageDataPath = join('page-data', pathName, 'page-data.json');
      writePrerenderConfig(
        join(
          '.vercel',
          'output',
          'functions',
          `${pageDataPath}.prerender-config.json`
        ),
        index + 1
      );
      return createSymlink(pageDataPath, functionName);
    }),
  ]);
}

export async function createAPIRoutes(functions: GatsbyFunction[]) {
  const apiDir = join('.vercel', 'output', 'functions', 'api');
  await ensureDir(apiDir);

  await Promise.allSettled(
    functions.map(async (func: GatsbyFunction) => {
      const apiRouteDir = `${apiDir}/${func.functionRoute}.func`;
      const handlerFile = func.originalAbsoluteFilePath;

      await ensureDir(apiRouteDir);

      await Promise.all([
        writeHandler({ outDir: apiRouteDir, handlerFile }),
        writeVCConfig({ functionDir: apiRouteDir }),
      ]);
    })
  );
}
