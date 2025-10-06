import { createRequire } from 'module';
import { join } from 'path';
import fs from 'fs';
import { BuildV3, Files } from './types';
import glob from './fs/glob';
import FileFsRef from './file-fs-ref';

const validFilenames = [
  'app',
  'index',
  'server',
  'src/app',
  'src/index',
  'src/server',
];

const backendFrameworks = ['express', 'hono', 'h3'];

export const isBackendFramework = (frameworkName?: string | null) => {
  return frameworkName && backendFrameworks.includes(frameworkName);
};

export const require_ = createRequire(__filename);

const validExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

export const validEntrypoints = validFilenames.flatMap(filename =>
  validExtensions.map(extension => `${filename}.${extension}`)
);

const entrypointsForMessage = validFilenames
  .map(filename => `- ${filename}.{${validExtensions.join(',')}}`)
  .join('\n');

export const prepareBackend = async (
  args: Parameters<BuildV3>[0],
  frameworkName: string,
  REGEX: RegExp
) => {
  // Introducing new behavior for the node builder where Typescript errors always
  // fail the build. Previously, this relied on noEmitOnError being true in the tsconfig.json
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';

  // Express's rendering engine support using the views directory as the entrypoint.
  const nodeBuilderArgs = {
    ...args,
    entrypoint: 'package.json',
    considerBuildCommand: true,
    entrypointCallback: async () => {
      return entrypointCallback(args, frameworkName, REGEX);
    },
  };
  let version = undefined;
  try {
    const resolved = require_.resolve(`${frameworkName}/package.json`, {
      paths: [args.workPath],
    });
    const packageVersion: string = require_(resolved).version;
    if (packageVersion) {
      version = packageVersion;
    }
  } catch (e) {
    // ignore
  }
  const framework = {
    slug: frameworkName,
    version,
  };
  return { nodeBuilderArgs, framework };
};

export const entrypointCallback = async (
  args: Parameters<BuildV3>[0],
  frameworkName: string,
  REGEX: RegExp
) => {
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
      findEntrypoint(
        await glob(entrypointGlob, join(args.workPath, dir)),
        REGEX
      );
    if (entrypointFromOutputDir) {
      return join(dir, entrypointFromOutputDir);
    }

    if (entrypointsNotMatchingRegex.length > 0) {
      throw new Error(
        `No entrypoint found which imports ${frameworkName}. Found possible ${pluralize('entrypoint', entrypointsNotMatchingRegex.length)}: ${entrypointsNotMatchingRegex.join(', ')}`
      );
    }
    throw new Error(
      `No entrypoint found in output directory: "${dir}". Searched for: \n${entrypointsForMessage}`
    );
  }
  const files = await glob(entrypointGlob, args.workPath);
  const { entrypoint: entrypointFromRoot, entrypointsNotMatchingRegex } =
    findEntrypoint(files, REGEX);
  if (entrypointFromRoot) {
    return entrypointFromRoot;
  }

  if (mainPackageEntrypoint) {
    const entrypointFromPackageJson = await glob(
      mainPackageEntrypoint,
      args.workPath
    );
    if (entrypointFromPackageJson[mainPackageEntrypoint]) {
      if (
        checkMatchesRegex(
          entrypointFromPackageJson[mainPackageEntrypoint],
          REGEX
        )
      ) {
        return mainPackageEntrypoint;
      }
    }
  }

  if (entrypointsNotMatchingRegex.length > 0) {
    throw new Error(
      `No entrypoint found which imports ${frameworkName}. Found possible ${pluralize('entrypoint', entrypointsNotMatchingRegex.length)}: ${entrypointsNotMatchingRegex.join(', ')}`
    );
  }
  throw new Error(
    `No entrypoint found. Searched for:\n${entrypointsForMessage}`
  );
};

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}

const findEntrypoint = (files: Record<string, FileFsRef>, REGEX: RegExp) => {
  const allEntrypoints = validFilenames.flatMap(filename =>
    validExtensions.map(extension => `${filename}.${extension}`)
  );

  const possibleEntrypointsInFiles = allEntrypoints.filter(entrypoint => {
    return files[entrypoint] !== undefined;
  });

  const entrypointsMatchingRegex = possibleEntrypointsInFiles.filter(
    entrypoint => {
      const file = files[entrypoint];
      return checkMatchesRegex(file, REGEX);
    }
  );

  const entrypointsNotMatchingRegex = possibleEntrypointsInFiles.filter(
    entrypoint => {
      const file = files[entrypoint];
      return !checkMatchesRegex(file, REGEX);
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

const checkMatchesRegex = (file: FileFsRef, REGEX: RegExp) => {
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
