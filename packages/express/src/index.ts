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

/**
 * The dev server works essentially the same as the build command, it creates
 * a shim file, but it places it in a gitignored location so as to not pollute
 * the users git index. For this reason, the shim's import statement will
 * need to be relative to the shim's location.
 */
export const startDevServer: StartDevServer = async opts => {
  const entrypoint = await entrypointCallback(opts);

  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeStartDevServer({
    ...opts,
    entrypoint,
    publicDir: 'public',
  });
};
