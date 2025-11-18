import glob from './fs/glob';
import { BuildV3, Config } from './types';
import type FileFsRef from './file-fs-ref';
import type { Files } from './types';
import { join } from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

export function generateNodeBuilderFunctions(
  frameworkName: string,
  regex: RegExp,
  validFilenames: string[],
  validExtensions: string[],
  nodeBuild: any, // necessary to avoid circular dependency
  opts?: {
    checks?: (info: { config: Config; isBun: boolean }) => void;
  }
) {
  const entrypointsForMessage = validFilenames
    .map(filename => `- ${filename}.{${validExtensions.join(',')}}`)
    .join('\n');

  const require_ = createRequire(__filename);

  const build: BuildV3 = async args => {
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
      checks: opts?.checks ?? (() => {}),
    });
    let version = undefined;
    try {
      const resolved = require_.resolve(`${frameworkName}/package.json`, {
        paths: [args.workPath],
      });
      const frameworkVersion: string = require_(resolved).version;
      if (frameworkVersion) {
        version = frameworkVersion;
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

  const entrypointCallback = async (args: Parameters<BuildV3>[0]) => {
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
      const {
        entrypoint: entrypointFromOutputDir,
        entrypointsNotMatchingRegex,
      } = findEntrypoint(await glob(entrypointGlob, join(args.workPath, dir)));
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
        if (
          checkMatchesRegex(entrypointFromPackageJson[mainPackageEntrypoint])
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

  const findEntrypoint = (files: Record<string, FileFsRef>) => {
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
    const matchesContent = content.match(regex);
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

  return {
    require_,
    findEntrypoint,
    build,
    entrypointCallback,
  };
}
