import type { IGatsbyPage, IGatsbyState } from 'gatsby/dist/redux/types';
import { getTransformedRoutes } from '@vercel/routing-utils';
import { pathExists, writeJson, remove } from 'fs-extra';
import { join } from 'path';

import type { Config } from './types';
import {
  createServerlessFunctions,
  createPageDataFunction,
  createAPIRoutes,
} from './helpers/functions';
import { createStaticDir } from './helpers/static';

export async function buildVercelOutput() {
  const { store } = require('gatsby/dist/redux');
  await remove(join('.vercel', 'output'));

  try {
    const { pages, redirects, functions } = store.getState() as IGatsbyState;

    const { ssrRoutes, dsgRoutes } = [...pages.values()].reduce(
      (acc, cur: IGatsbyPage) => {
        if (cur.mode === 'SSR') {
          acc.ssrRoutes.push(cur.path);
        } else if (cur.mode === 'DSG') {
          acc.dsgRoutes.push(cur.path);
        }

        return acc;
      },
      {
        ssrRoutes: [] as IGatsbyPage['path'][],
        dsgRoutes: [] as IGatsbyPage['path'][],
      }
    );

    await createStaticDir();

    await Promise.all([
      createPageDataFunction(),
      functions.length > 0 && createAPIRoutes(functions),
      (ssrRoutes.length > 0 || dsgRoutes.length > 0) &&
        createServerlessFunctions({ ssrRoutes, dsgRoutes }),
    ]);

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

    await writeJson('.vercel/output/config.json', config);
  } catch (e) {
    console.error('Failed to create Vercel build output', e);
  }
}
