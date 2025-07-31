export const version = 3;
export * from './build';
// @ts-expect-error - FIXME: startDevServer types are not exported
import { startDevServer as nodeStartDevServer } from '@vercel/node';
import { findEntrypoint, shim } from './build';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { ShouldServe, StartDevServer } from '@vercel/build-utils';

export const shouldServe: ShouldServe = async opts => {
  const requestPath = opts.requestPath.replace(/\/$/, ''); // sanitize trailing '/'
  // Don't override API routes, otherwise serve it
  if (requestPath.startsWith('api')) {
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
  const entrypoint = findEntrypoint(opts.files);
  const entrypointExtension = entrypoint.split('.').pop();
  // FIXME: for CJS the shim will need to use `require` instead of `import`
  const shimString = shim(entrypoint, '../..');
  const shimEntrypoint = `.vercel/dev/shim.${entrypointExtension}`;
  await mkdir(dirname(shimEntrypoint), { recursive: true });
  await writeFile(shimEntrypoint, shimString);

  return nodeStartDevServer({
    ...opts,
    entrypoint: shimEntrypoint,
  });
};
