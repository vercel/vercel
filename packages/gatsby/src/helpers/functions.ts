import { join } from 'path';
import { ensureDir } from 'fs-extra';
import { IGatsbyFunction } from 'gatsby/dist/redux/types';
import { createSymlink } from '../utils/symlink';

import {
  writeHandler,
  writeVCConfig,
  copyFunctionLibs,
  movePageData,
  copyHTMLFiles,
  writePrerenderConfig,
} from '../handlers/build';

export async function createServerlessFunctions({
  dsgRoutes,
  ssrRoutes,
}: {
  dsgRoutes: string[];
  ssrRoutes: string[];
}) {
  /* Gatsby SSR/DSG on Vercel is enabled through Vercel Serverless Functions.
     This plugin creates one Serverless Function called `_ssr.func` that is used by SSR and DSG pages through symlinks. 
     DSG is enabled through prerender functions.
  */
  const functionDir = join('.vercel', 'output', 'functions', '_ssr.func');
  const handlerFile = join(
    __dirname,
    '..',
    'handlers',
    'templates',
    './ssr-handler'
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
      return createSymlink(pathName);
    }),
    ...dsgRoutes.map(async pathName => {
      await writePrerenderConfig(
        join(
          '.vercel',
          'output',
          'functions',
          `${pathName.replace(/\/$/, '')}.prerender-config.json`
        )
      );

      return createSymlink(pathName);
    }),
  ]);
}

export async function createPageDataFunction() {
  /* Gatsby uses /page-data/<path>/page-data.json to fetch data. This plugin creates a 
    `page-data.func` function that dynamically generates this data if it's not available in `static/page-data`. */
  const functionDir = join('.vercel', 'output', 'functions', '_page-data.func');
  const handlerFile = join(
    __dirname,
    '..',
    'handlers',
    'templates',
    './page-data'
  );

  await ensureDir(functionDir);

  await Promise.all([
    writeHandler({ outDir: functionDir, handlerFile }),
    copyFunctionLibs({ functionDir }),
    movePageData({ functionDir }),
    writeVCConfig({ functionDir }),
  ]);
}

export async function createAPIRoutes(functions: IGatsbyFunction[]) {
  const apiDir = join('.vercel', 'output', 'functions', 'api');
  await ensureDir(apiDir);

  await Promise.allSettled(
    functions.map(async (func: IGatsbyFunction) => {
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
