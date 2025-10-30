export const version = 3;
export * from './build';
// @ts-expect-error - FIXME: startDevServer types are not exported
import { startDevServer as nodeStartDevServer } from '@vercel/node';
import { entrypointCallback } from './build';
import type { ShouldServe, StartDevServer } from '@vercel/build-utils';

export const shouldServe: ShouldServe = async opts => {
  const requestPath = opts.requestPath.replace(/\/$/, ''); // sanitize trailing '/'
  if (requestPath.startsWith('api') && opts.hasMatched) {
    // Don't override API routes, otherwise serve it
    return false;
  }
  // NOTE: public assets are served by the default handler
  return true;
};

export const startDevServer: StartDevServer = async opts => {
  const entrypoint = await entrypointCallback(opts);

  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeStartDevServer({
    ...opts,
    entrypoint,
  });
};
