import { join } from 'path';

import { getTransformedRoutes } from '@vercel/routing-utils';
import { pathExists, writeJson, remove } from 'fs-extra';

import { validateGatsbyState } from './schemas';
import {
  createServerlessFunctions,
  createPageDataFunction,
  createAPIRoutes,
} from './helpers/functions';
import { createStaticDir } from './helpers/static';

export interface GenerateVercelBuildOutputAPI3OutputOptions {
  exportPath: string;
  gatsbyStoreState: {
    pages: Map<string, unknown>;
    redirects: unknown;
    functions: unknown;
  };
  [x: string]: unknown;
}
import type { Config, Routes } from './types';
export async function generateVercelBuildOutputAPI3Output({
  exportPath,
  gatsbyStoreState,
}: GenerateVercelBuildOutputAPI3OutputOptions) {
  const state = {
    pages: Array.from(gatsbyStoreState.pages.entries()), // must transform from a Map for validation
    redirects: gatsbyStoreState.redirects,
    functions: gatsbyStoreState.functions,
  };

  console.log(state);

  if (validateGatsbyState(state)) {
    console.log('▲ Creating Vercel build output');
    await remove(join('.vercel', 'output'));

    const { pages, redirects, functions } = state;

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

    await createStaticDir();

    const createPromises = [createPageDataFunction()];

    if (functions.length > 0) createPromises.push(createAPIRoutes(functions));

    if (ssrRoutes.length > 0 || dsgRoutes.length > 0)
      createPromises.push(createServerlessFunctions({ ssrRoutes, dsgRoutes }));

    await Promise.all(createPromises);

    const vercelConfigPath = `${process.cwd()}/vercel.config.js`;
    const vercelConfig: Config = (await pathExists(vercelConfigPath))
      ? require(vercelConfigPath).default
      : {};

    const { routes } = getTransformedRoutes({
      ...vercelConfig,
      trailingSlash: false,
      redirects: redirects.map(({ fromPath, toPath, isPermanent }) => ({
        source: fromPath,
        destination: toPath,
        permanent: isPermanent,
      })),
      rewrites: [
        {
          source: '^/page-data(?:/(.*))/page-data\\.json$',
          destination: '/_page-data',
        },
      ],
    });

    const config: Config = {
      version: 3,
      routes: routes || undefined,
    };

    console.log(config);

    await writeJson(exportPath, config);
    console.log('Vercel output has been generated');
  } else {
    throw new Error(
      'Gatsby state validation error. Please file an issue https://vercel.com/help#issues'
    );
  }
}
