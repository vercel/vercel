import { type BuildV3 } from '@vercel/build-utils';
// @ts-expect-error - FIXME: hono-framework build is not exported
import { build as nodeBuild } from '@vercel/node';

export const build: BuildV3 = async ({
  files,
  workPath,
  config,
  meta = {},
}) => {
  const validEntrypoints = [
    'index.ts',
    'index.js',
    'index.mjs',
    'index.cjs',
    'src/index.ts',
    'src/index.js',
    'src/index.mjs',
    'src/index.cjs',
  ];
  // `build` accepts an entrypoint path, but we'll override that with the scanned entrypoint
  const entrypoint = validEntrypoints.find(path => files[path] !== undefined);
  if (!entrypoint) {
    throw new Error('No valid entrypoint found');
  }

  return nodeBuild({
    entrypoint,
    files,
    shim,
    workPath,
    useWebApi: true,
    config,
    meta,
  });
};

const shim = (handler: string) => `
import app from "./${handler}";

const handle = async (request) => {
  return app.fetch(request);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
export const OPTIONS = handle;
export const HEAD = handle;`;
