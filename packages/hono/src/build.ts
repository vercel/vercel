import { type BuildV3 } from '@vercel/build-utils';
import { build as nodeBuild } from '@vercel/node';

console.log('hono build', nodeBuild);

export const build: BuildV3 = async ({
  entrypoint: _entrypointPath,
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
  const entrypoint = validEntrypoints.find(path => files[path] !== undefined);
  if (!entrypoint) {
    throw new Error('No valid entrypoint found');
  }
  //   console.log('entrypoint', entrypoint);

  //   // Create the entry.js wrapper file in the workPath directory
  const shim = `

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

  //   // Write the wrapper file to the workPath directory
  //   // const entryPath = join(workPath, 'entry.js');
  //   // await fs.writeFile(entryPath, entryContent, 'utf8');

  config.includeFiles;
  // Call nodeBuild with the entry.js file as the entrypoint
  return nodeBuild({
    entrypoint,
    files,
    shim,
    workPath,
    config,
    meta,
  });
};
