import { Files, FileFsRef, type BuildV3, glob } from '@vercel/build-utils';
// @ts-expect-error - FIXME: framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { createRequire } from 'module';
import { join } from 'path';
import fs from 'fs';

const frameworkName = 'hono';
const REGEX = /(?:from|require|import)\s*(?:\(\s*)?["']hono["']\s*(?:\))?/g;

const validFilenames = [
  'app',
  'index',
  'server',
  'src/app',
  'src/index',
  'src/server',
];

export const require_ = createRequire(__filename);

const validExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

const entrypointsForMessage = validFilenames
  .map(filename => `- ${filename}.{${validExtensions.join(',')}}`)
  .join('\n');

export const build: BuildV3 = async args => {
  // Introducing new behavior for the node builder where Typescript errors always
  // fail the build. Previously, this relied on noEmitOnError being true in the tsconfig.json
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';

  // Express's rendering engine support using the views directory as the entrypoint.
  const includeFiles = ['views/**/*'];
  const includeFilesFromConfig = args.config.includeFiles;
  if (includeFilesFromConfig) {
    includeFiles.push(...includeFilesFromConfig);
  }

  const res = await nodeBuild({
    ...args,
    config: {
      ...args.config,
      includeFiles,
    },
    // this is package.json, but we'll replace it with the return value of the entrypointCallback
    // after install and build scripts have had a chance to run
    entrypoint: 'package.json',
    considerBuildCommand: true,
    entrypointCallback: async () => {
      return entrypointCallback(args);
    },
  });
  let version = undefined;
  try {
    const resolved = require_.resolve(`${frameworkName}/package.json`, {
      paths: [args.workPath],
    });
    const honoVersion: string = require_(resolved).version;
    if (honoVersion) {
      version = honoVersion;
    }
  } catch (e) {
    // ignore
  }
  res.output.framework = {
    slug: frameworkName,
    version,
  };
  return res;
};

export const entrypointCallback = async (args: Parameters<BuildV3>[0]) => {
  const mainPackageEntrypoint = findMainPackageEntrypoint(args.files);
  // builds a glob pattern like {app,index,server,src/app,src/index,src/server}.{js,cjs,mjs,ts,cts,mts}
  const entrypointGlob = `{${validFilenames
    .map(entrypoint => `${entrypoint}`)
    .join(',')}}.{${validExtensions.join(',')}}`;

  const dir = args.config.projectSettings?.outputDirectory?.replace(
    /^\/+|\/+$/g,
    ''
  );
  // if an output directory is specified, look there first for an entrypoint
  if (dir) {
    const { entrypoint: entrypointFromOutputDir, entrypointsNotMatchingRegex } =
      findEntrypoint(await glob(entrypointGlob, join(args.workPath, dir)));
    if (entrypointFromOutputDir) {
      return join(dir, entrypointFromOutputDir);
    }

    if (entrypointsNotMatchingRegex.length > 0) {
      throw new Error(
        `No entrypoint found which imports hono. Found possible ${pluralize('entrypoint', entrypointsNotMatchingRegex.length)}: ${entrypointsNotMatchingRegex.join(', ')}`
      );
    }
    throw new Error(
      `No entrypoint found in output directory: "${dir}". Searched for: \n${entrypointsForMessage}`
    );
  }
  const files = await glob(entrypointGlob, args.workPath);
  const { entrypoint: entrypointFromRoot, entrypointsNotMatchingRegex } =
    findEntrypoint(files);
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

  if (entrypointsNotMatchingRegex.length > 0) {
    throw new Error(
      `No entrypoint found which imports hono. Found possible ${pluralize('entrypoint', entrypointsNotMatchingRegex.length)}: ${entrypointsNotMatchingRegex.join(', ')}`
    );
  }
  throw new Error(
    `No entrypoint found. Searched for:\n${entrypointsForMessage}`
  );
};

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}

export const findEntrypoint = (files: Record<string, FileFsRef>) => {
  const allEntrypoints = validFilenames.flatMap(filename =>
    validExtensions.map(extension => `${filename}.${extension}`)
  );

  const possibleEntrypointsInFiles = allEntrypoints.filter(entrypoint => {
    return files[entrypoint] !== undefined;
  });

  const entrypointsMatchingRegex = possibleEntrypointsInFiles.filter(
    entrypoint => {
      const file = files[entrypoint];
      return checkMatchesRegex(file);
    }
  );

  const entrypointsNotMatchingRegex = possibleEntrypointsInFiles.filter(
    entrypoint => {
      const file = files[entrypoint];
      return !checkMatchesRegex(file);
    }
  );

  const entrypoint = entrypointsMatchingRegex[0];
  if (entrypointsMatchingRegex.length > 1) {
    console.warn(
      `Multiple entrypoints found: ${entrypointsMatchingRegex.join(', ')}. Using ${entrypoint}.`
    );
  }

  return {
    entrypoint,
    entrypointsNotMatchingRegex,
  };
};

const checkMatchesRegex = (file: FileFsRef) => {
  const content = fs.readFileSync(file.fsPath, 'utf-8');
  const matchesContent = content.match(REGEX);
  return matchesContent !== null;
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
