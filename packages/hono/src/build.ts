import { Files, type BuildV3 } from '@vercel/build-utils';
// @ts-expect-error - FIXME: hono-framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { sep } from 'path';

export const build: BuildV3 = async args => {
  const entrypoint = findEntrypoint(args.files);

  // Introducing new behavior for the node builder where Typescript errors always
  // fail the build. Previously, this relied on noEmitOnError being true in the tsconfig.json
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeBuild({
    ...args,
    entrypoint,
    considerBuildCommand: true,
  });
};

export const findEntrypoint = (files: Files) => {
  const validEntrypoints = [
    ['index.cjs'],
    ['index.js'],
    ['index.mjs'],
    ['index.mts'],
    ['index.ts'],
    ['server.cjs'],
    ['server.js'],
    ['server.mjs'],
    ['server.mts'],
    ['server.ts'],
    ['src', 'index.cjs'],
    ['src', 'index.js'],
    ['src', 'index.mjs'],
    ['src', 'index.mts'],
    ['src', 'index.ts'],
  ];

  const entrypoint = validEntrypoints.find(entrypointParts => {
    const path = entrypointParts.join(sep);
    return files[path] !== undefined;
  });

  if (!entrypoint) {
    throw new Error('No valid entrypoint found');
  }
  return entrypoint.join(sep);
};
