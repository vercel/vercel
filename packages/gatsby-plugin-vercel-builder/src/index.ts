import { join } from 'path';
import { getTransformedRoutes } from '@vercel/routing-utils';
import { writeJson, remove } from 'fs-extra';
import { validateGatsbyState } from './schemas';
import {
  createServerlessFunctions,
  createPageDataFunctions,
  createAPIRoutes,
} from './helpers/functions';
import { createStaticDir } from './helpers/static';
import type { Config, Routes } from './types';

export interface GenerateVercelBuildOutputAPI3OutputOptions {
  exportPath: string;
  gatsbyStoreState: {
    pages: Map<string, unknown>;
    redirects: unknown;
    functions: unknown;
    config: unknown;
  };
  [x: string]: unknown;
}
export async function generateVercelBuildOutputAPI3Output({
  exportPath,
  gatsbyStoreState,
}: GenerateVercelBuildOutputAPI3OutputOptions) {
  const state = {
    pages: Array.from(gatsbyStoreState.pages.entries()), // must transform from a Map for validation
    redirects: gatsbyStoreState.redirects,
    functions: gatsbyStoreState.functions,
    config: gatsbyStoreState.config,
  };

  if (validateGatsbyState(state)) {
    console.log('▲ Creating Vercel build output');
    await remove(join('.vercel', 'output'));

    const { pages, redirects, functions, config: gatsbyConfig } = state;

    const { ssrRoutes, dsgRoutes } = pages.reduce<Routes>(
      (acc, [, cur]) => {
        if (cur.mode === 'SSR') {
          acc.ssrRoutes.push(cur.path);
        } else if (cur.mode === 'DSG') {
          acc.dsgRoutes.push(cur.path);
        }

        return acc;
      },
      {
        ssrRoutes: [],
        dsgRoutes: [],
      }
    );

    await createStaticDir({ prefix: gatsbyConfig.pathPrefix });

    const createPromises: Promise<void>[] = [];

    if (functions.length > 0) {
      createPromises.push(createAPIRoutes(functions));
    }

    if (ssrRoutes.length > 0 || dsgRoutes.length > 0) {
      createPromises.push(
        createPageDataFunctions(
          { ssrRoutes, dsgRoutes },
          gatsbyConfig.pathPrefix
        )
      );
      createPromises.push(createServerlessFunctions({ ssrRoutes, dsgRoutes }));
    }

    await Promise.all(createPromises);

    let trailingSlash: boolean | undefined = undefined;

    if (gatsbyConfig.trailingSlash === 'always') {
      trailingSlash = true;
    } else if (gatsbyConfig.trailingSlash === 'never') {
      trailingSlash = false;
    }

    const { routes } = getTransformedRoutes({
      trailingSlash,
      redirects: redirects.map(({ fromPath, toPath, isPermanent }) => ({
        source: fromPath,
        destination: toPath,
        permanent: isPermanent,
      })),
    });

    const config: Config = {
      version: 3,
      routes: routes || undefined,
    };

    await writeJson(exportPath, config);
    console.log('Vercel output has been generated');
  } else {
    throw new Error(
      'Gatsby state validation error. Please file an issue https://vercel.com/help#issues'
    );
  }
}
