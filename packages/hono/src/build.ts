import { Files, type BuildV3 } from '@vercel/build-utils';
// @ts-expect-error - FIXME: hono-framework build is not exported
import { build as nodeBuild } from '@vercel/node';

export const build: BuildV3 = async args => {
  const entrypoint = findEntrypoint(args.files);

  // Introducing new behavior for the node builder where Typescript errors always
  // fail the build. Previously, this relied on noEmitOnError being true in the tsconfig.json
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeBuild({
    ...args,
    entrypoint,
  });
};

export const findEntrypoint = (files: Files) => {
  const validEntrypoints = [
    'index.cjs',
    'index.js',
    'index.mjs',
    'index.mts',
    'index.ts',
    'server.cjs',
    'server.js',
    'server.mjs',
    'server.mts',
    'server.ts',
    'src/index.cjs',
    'src/index.js',
    'src/index.mjs',
    'src/index.mts',
    'src/index.ts',
  ];

  console.log('🔍 findEntrypoint - Original file keys:', Object.keys(files));
  console.log('🔍 findEntrypoint - Valid entrypoints:', validEntrypoints);

  // Normalize all file keys to POSIX format for comparison
  const normalizedFiles = Object.keys(files).reduce((acc, key) => {
    const normalizedKey = key.replace(/\\/g, '/');
    acc[normalizedKey] = files[key];
    return acc;
  }, {} as Files);

  console.log(
    '🔍 findEntrypoint - Normalized file keys:',
    Object.keys(normalizedFiles)
  );

  const entrypoint = validEntrypoints.find(
    path => normalizedFiles[path] !== undefined
  );

  console.log('🔍 findEntrypoint - Found entrypoint:', entrypoint);

  if (!entrypoint) {
    console.log('❌ findEntrypoint - No valid entrypoint found!');
    throw new Error('No valid entrypoint found');
  }
  return entrypoint;
};
