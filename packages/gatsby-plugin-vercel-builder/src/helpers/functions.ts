import { join } from 'node:path';
import { ensureDir } from 'fs-extra';
import { createSymlink } from '../utils/symlink.js';
import {
  writeHandler,
  writeVCConfig,
  copyFunctionLibs,
  copyHTMLFiles,
  writePrerenderConfig,
} from '../handlers/build.js';
import type { GatsbyFunction, GatsbyPage } from '../schemas.js';

/**
 * Gatsby SSR/DSG on Vercel is enabled through Vercel Serverless Functions.
 * This plugin creates one Serverless Function called `_ssr.func` that is used by SSR and DSG pages through symlinks.
 * DSG is enabled through prerender functions.
 */
export async function createServerlessFunctions(
  ssrRoutes: GatsbyPage[],
  prefix?: string
) {
  let functionName: string;
  let functionDir: string;
  const handlerFile = join(__dirname, '../templates/ssr-handler.js');

  await Promise.all(
    ssrRoutes.map(async (page, index) => {
      let pathName = page.path;

      // HTML renderer
      const ssrPath = join(prefix ?? '', pathName, 'index.html');
      if (index === 0) {
        // For the first page, create the SSR Serverless Function
        functionName = `${ssrPath}.func`;
        functionDir = join('.vercel/output/functions', functionName);

        await ensureDir(functionDir);

        await Promise.all([
          writeHandler({ outDir: functionDir, handlerFile, prefix }),
          copyFunctionLibs({ functionDir }),
          copyHTMLFiles({ functionDir }),
          writeVCConfig({ functionDir }),
        ]);
      } else {
        // If it's not the first page, then symlink to the first function
        await createSymlink(ssrPath, functionName);
      }

      if (page.mode === 'DSG') {
        writePrerenderConfig(
          join(
            '.vercel',
            'output',
            'functions',
            `${ssrPath}.prerender-config.json`
          ),
          index + 1
        );
      }

      // page-data renderer
      if (!pathName || pathName === '/') {
        pathName = 'index';
      }

      const pageDataPath = join(
        prefix ?? '',
        'page-data',
        pathName,
        'page-data.json'
      );
      await createSymlink(pageDataPath, functionName);

      if (page.mode === 'DSG') {
        writePrerenderConfig(
          join(
            '.vercel',
            'output',
            'functions',
            `${pageDataPath}.prerender-config.json`
          ),
          index + 1
        );
      }
    })
  );
}

export async function createAPIRoutes(
  functions: GatsbyFunction[],
  prefix?: string
) {
  const apiDir = join('.vercel', 'output', 'functions', 'api', prefix ?? '');
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
