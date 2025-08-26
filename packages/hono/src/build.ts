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
    entrypointCallback: (preparedFiles: Files) => {
      return findEntrypoint(preparedFiles);
    },
  });
};

export const findEntrypoint = (files: Files) => {
  const validFilenames = [['app'], ['index'], ['server'], ['src', 'index']];

  const validExtensions = ['js', 'cjs', 'mjs', 'ts', 'mts'];

  const validEntrypoints = validFilenames.flatMap(filename =>
    validExtensions.map(extension => `${filename.join(sep)}.${extension}`)
  );

  const entrypoint = validEntrypoints.find(entrypoint => {
    return files[entrypoint] !== undefined;
  });

  if (!entrypoint) {
    const entrypointsForMessage = validFilenames
      .map(filename => `- ${filename.join(sep)}.{${validExtensions.join(',')}}`)
      .join('\n');
    throw new Error(
      `No valid entrypoint found. Valid entrypoints are:\n${entrypointsForMessage}`
    );
  }
  return entrypoint;
};
