import { Files, type BuildV3 } from '@vercel/build-utils';
// @ts-expect-error - FIXME: hono-framework build is not exported
import { build as nodeBuild } from '@vercel/node';

export const build: BuildV3 = async ({
  files,
  workPath,
  config,
  meta = {},
}) => {
  const entrypoint = findEntrypoint(files);

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

export const shim = (handler: string, relativePathToHandler = '.') => `
// @ts-ignore
import app from "${relativePathToHandler}/${handler}";

// @ts-ignore
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

export const findEntrypoint = (files: Files) => {
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
  const entrypoint = validEntrypoints.find(path => files[path] !== undefined);
  if (!entrypoint) {
    throw new Error('No valid entrypoint found');
  }
  return entrypoint;
};
