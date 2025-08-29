import { Files, FileFsRef, type BuildV3, glob } from '@vercel/build-utils';
// @ts-expect-error - FIXME: hono-framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { join } from 'path';
import fs from 'fs';

const REGEX = /(?:from|require|import)\s*(?:\(\s*)?["']hono["']\s*(?:\))?/g;

const validFilenames = [
  'app',
  'index',
  'server',
  'src/app',
  'src/index',
  'src/server',
];

const validExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

const entrypointsForMessage = validFilenames
  .map(filename => `- ${filename}.{${validExtensions.join(',')}}`)
  .join('\n');

export const build: BuildV3 = async args => {
  // Introducing new behavior for the node builder where Typescript errors always
  // fail the build. Previously, this relied on noEmitOnError being true in the tsconfig.json
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeBuild({
    ...args,
    // this is package.json, but we'll replace it with the return value of the entrypointCallback
    // after install and build scripts have had a chance to run
    entrypoint: 'package.json',
    considerBuildCommand: true,
    entrypointCallback: async () => {
      return entrypointCallback(args);
    },
  });
};

export const entrypointCallback = async (args: Parameters<BuildV3>[0]) => {
  const mainPackageEntrypoint = findMainPackageEntrypoint(args.files);
  const entrypointGlob = `{${validFilenames
    .map(entrypoint => `${entrypoint}`)
    .join(',')}}.{${validExtensions.join(',')}}`;

  const dir = args.config.projectSettings?.outputDirectory?.replace(
    /^\/+|\/+$/g,
    ''
  );
  // if an output directory is specified, look there first for an entrypoint
  if (dir) {
    const entrypointFromOutputDir = findEntrypoint(
      await glob(entrypointGlob, join(args.workPath, dir))
    );
    if (entrypointFromOutputDir) {
      return join(dir, entrypointFromOutputDir);
    }

    throw new Error(
      `No entrypoint found in output directory: "${dir}". Searched for: \n${entrypointsForMessage}`
    );
  }
  const files = await glob(entrypointGlob, args.workPath);
  const entrypointFromRoot = findEntrypoint(files);
  if (entrypointFromRoot) {
    return entrypointFromRoot;
  }

  if (mainPackageEntrypoint) {
    const entrypointFromPackageJson = await glob(
      mainPackageEntrypoint,
      args.workPath
    );
    if (entrypointFromPackageJson[mainPackageEntrypoint]) {
      if (checkMatchesRegex(entrypointFromPackageJson[mainPackageEntrypoint])) {
        return mainPackageEntrypoint;
      }
    }
  }

  throw new Error(
    `No entrypoint found. Searched for: \n${entrypointsForMessage}`
  );
};

export const findEntrypoint = (files: Record<string, FileFsRef>) => {
  const validEntrypoints = validFilenames.flatMap(filename =>
    validExtensions.map(extension => `${filename}.${extension}`)
  );

  const entrypoints = validEntrypoints.filter(entrypoint => {
    const matches = files[entrypoint] !== undefined;
    if (matches) {
      const file = files[entrypoint];
      return checkMatchesRegex(file);
    }
    return false;
  });

  const entrypoint = entrypoints[0];
  if (entrypoints.length > 1) {
    console.warn(
      `Multiple entrypoints found: ${entrypoints.join(', ')}. Using ${entrypoint}.`
    );
  }

  return entrypoint;
};

const checkMatchesRegex = (file: FileFsRef) => {
  if (file.type === 'FileFsRef') {
    const content = fs.readFileSync(file.fsPath, 'utf-8');
    const matchesContent = content.match(REGEX);
    return matchesContent !== null;
  }
  return false;
};

const findMainPackageEntrypoint = (
  files: Files | Record<string, FileFsRef>
) => {
  const packageJson = files['package.json'];
  if (packageJson) {
    if (packageJson.type === 'FileFsRef') {
      const packageJsonContent = fs.readFileSync(packageJson.fsPath, 'utf-8');
      let packageJsonJson: object;
      try {
        packageJsonJson = JSON.parse(packageJsonContent);
      } catch (_e) {
        packageJsonJson = {};
      }
      if (
        'main' in packageJsonJson &&
        typeof packageJsonJson.main === 'string'
      ) {
        return packageJsonJson.main;
      }
    }
  }
  return null;
};
