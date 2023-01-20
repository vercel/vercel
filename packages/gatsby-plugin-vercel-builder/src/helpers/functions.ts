import { join } from 'path';

import { ensureDir } from 'fs-extra';

import { createSymlink } from '../utils/symlink';
import {
  writeHandler,
  writeVCConfig,
  copyFunctionLibs,
  movePageData,
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
      const funcPath = join(pathName, 'index.html');
      return createSymlink(funcPath, functionName);
    }),
    ...dsgRoutes.map(async (pathName, index) => {
      const funcPath = join(pathName, 'index.html');
      writePrerenderConfig(
        join(
          '.vercel',
          'output',
          'functions',
          `${funcPath}.prerender-config.json`
        ),
        index + 1
      );
      return createSymlink(funcPath, functionName);
    }),
  ]);
}

export async function createPageDataFunctions({
  dsgRoutes,
  ssrRoutes,
}: Routes) {
  /* Gatsby uses /page-data/<path>/page-data.json to fetch data. This plugin creates a
    `_page-data.func` function that dynamically generates this data if it's not available in `static/page-data`. */
  const functionName = '_page-data.func';
  const functionDir = join('.vercel', 'output', 'functions', functionName);
  const handlerFile = join(
    __dirname,
    '..',
    'handlers',
    'templates',
    './page-data.js'
  );

  await ensureDir(functionDir);

  await Promise.all([
    writeHandler({ outDir: functionDir, handlerFile }),
    copyFunctionLibs({ functionDir }),
    movePageData({ functionDir }),
    writeVCConfig({ functionDir }),
  ]);

  await Promise.all([
    ...ssrRoutes.map(async pathName => {
      const funcPath = join('page-data', pathName, 'page-data.json');
      return createSymlink(funcPath, functionName);
    }),
    ...dsgRoutes.map(async (pathName, index) => {
      const funcPath = join('page-data', pathName, 'page-data.json');
      writePrerenderConfig(
        join(
          '.vercel',
          'output',
          'functions',
          `${funcPath}.prerender-config.json`
        ),
        index + 1
      );
      return createSymlink(funcPath, functionName);
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
