import { Files, FileFsRef, type BuildV3 } from '@vercel/build-utils';
// @ts-expect-error - FIXME: hono-framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { sep } from 'path';
import fs from 'fs';

const REGEX = /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/g;

export const build: BuildV3 = async args => {
  const entrypoint = findEntrypoint(args.files);

  // Introducing new behavior for the node builder where Typescript errors always
  // fail the build. Previously, this relied on noEmitOnError being true in the tsconfig.json
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeBuild({
    ...args,
    entrypoint,
    considerBuildCommand: true,
    entrypointCallback: (preparedFiles: Files | Record<string, FileFsRef>) => {
      return findEntrypoint(preparedFiles);
    },
  });
};

export const findEntrypoint = (files: Files | Record<string, FileFsRef>) => {
  const validFilenames = [
    ['app'],
    ['index'],
    ['server'],
    ['src', 'app'],
    ['src', 'index'],
    ['src', 'server'],
  ];

  const validExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

  const validEntrypoints = validFilenames.flatMap(filename =>
    validExtensions.map(extension => `${filename.join(sep)}.${extension}`)
  );

  const entrypoints = validEntrypoints.filter(entrypoint => {
    const matches = files[entrypoint] !== undefined;
    if (matches) {
      const file = files[entrypoint];
      if (file.type === 'FileBlob') {
        const content = file.data.toString();
        const matchesContent = content.match(REGEX);
        return matchesContent !== null;
      }
      if (file.type === 'FileFsRef') {
        const content = fs.readFileSync(file.fsPath, 'utf-8');
        const matchesContent = content.match(REGEX);
        return matchesContent !== null;
      }
      if (file.type === 'FileRef') {
        // we don't expect any of these since the Files is actuall FilesFsRef
        // https://github.com/vercel/vercel/blob/2fb1eaf0bab62039881e1fb0fbcb64a674c47e6e/packages/cli/src/commands/build/index.ts#L510
        // but return true here to be safe.
        return true;
      }
    }
    return false;
  });

  const entrypoint = entrypoints[0];
  if (entrypoints.length > 1) {
    console.warn(
      `Multiple entrypoints found: ${entrypoints.join(', ')}. Using ${entrypoint}.`
    );
  }

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
