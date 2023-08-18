import { getTransformedRoutes } from '@vercel/routing-utils';
import { writeJson } from 'fs-extra';
import { validateGatsbyState } from './schemas';
import {
  createServerlessFunctions,
  createAPIRoutes,
} from './helpers/functions';
import { createStaticDir } from './helpers/static';
import { join } from 'path';
import type { Config } from './types';

export interface GenerateVercelBuildOutputAPI3OutputOptions {
  gatsbyStoreState: {
    pages: Map<string, unknown>;
    redirects: unknown;
    functions: unknown;
    config: unknown;
  };
}

export async function generateVercelBuildOutputAPI3Output({
  gatsbyStoreState,
}: GenerateVercelBuildOutputAPI3OutputOptions) {
  const state = {
    pages: Array.from(gatsbyStoreState.pages.entries()), // must transform from a Map for validation
    redirects: gatsbyStoreState.redirects,
    functions: gatsbyStoreState.functions,
    config: gatsbyStoreState.config,
  };

  if (validateGatsbyState.Check(state)) {
    console.log('▲ Creating Vercel build output');

    const { pages, redirects, functions, config: gatsbyConfig } = state;
    const { pathPrefix = '' } = gatsbyConfig;

    const ssrRoutes = pages
      .map(p => p[1])
      .filter(page => page.mode === 'SSR' || page.mode === 'DSG');

    const ops: Promise<void>[] = [];

    if (functions.length > 0) {
      ops.push(createAPIRoutes(functions, pathPrefix));
    }

    if (ssrRoutes.length > 0) {
      ops.push(createServerlessFunctions(ssrRoutes, pathPrefix));
    }

    await Promise.all(ops);

    // "static" directory needs to happen last since it moves "public"
    await createStaticDir(pathPrefix);

    let trailingSlash: boolean | undefined = undefined;
    if (gatsbyConfig.trailingSlash === 'always') {
      trailingSlash = true;
    } else if (gatsbyConfig.trailingSlash === 'never') {
      trailingSlash = false;
    }

    const routes =
      getTransformedRoutes({
        trailingSlash,
        redirects: redirects.map(({ fromPath, toPath, isPermanent }) => ({
          source: fromPath,
          destination: toPath,
          permanent: isPermanent,
        })),
      }).routes || [];

    routes.push({
      handle: 'error',
    });
    if (pathPrefix) {
      routes.push({
        status: 404,
        src: '^(?!/api).*$',
        dest: join(pathPrefix, '404.html'),
      });
    }
    routes.push({
      status: 404,
      src: '^(?!/api).*$',
      dest: '404.html',
    });

    const config: Config = {
      version: 3,
      routes: routes || undefined,
    };

    await writeJson('.vercel/output/config.json', config);
    console.log('Vercel output has been generated');
  } else {
    const errors = [...validateGatsbyState.Errors(state)];
    throw new Error(
      `Gatsby state validation failed:\n${errors
        .map(
          err =>
            `  - ${err.message}, got ${typeof err.value} (${JSON.stringify(
              err.value
            )}) at path "${err.path}"\n`
        )
        .join(
          ''
        )}Please check your Gatsby configuration files, or file an issue at https://vercel.com/help#issues`
    );
  }
}
