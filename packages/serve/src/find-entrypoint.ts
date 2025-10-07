import { createRequire } from 'module';
import { join } from 'path';
import { readFileSync } from 'fs';
import { Files, FileFsRef, glob, BuildV2, debug } from '@vercel/build-utils';

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

export const entrypointCallback = async (
  args: Parameters<BuildV2>[0],
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
        `No entrypoint found which imports express. Found possible ${pluralize('entrypoint', entrypointsNotMatchingRegex.length)}: ${entrypointsNotMatchingRegex.join(', ')}`
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
      `No entrypoint found which imports express. Found possible ${pluralize('entrypoint', entrypointsNotMatchingRegex.length)}: ${entrypointsNotMatchingRegex.join(', ')}`
    );
  }
  throw new Error(
    `No entrypoint found. Searched for:\n${entrypointsForMessage}`
  );
};

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}

export const findEntrypoint = (
  files: Record<string, FileFsRef>,
  REGEX: RegExp
) => {
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
    debug(
      `[@vercel/express] Multiple valid entrypoints found: ${entrypointsMatchingRegex.join(', ')}`
    );
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
  const content = readFileSync(file.fsPath, 'utf-8');
  const matchesContent = content.match(REGEX);
  return matchesContent !== null;
};

const findMainPackageEntrypoint = (
  files: Files | Record<string, FileFsRef>
) => {
  const packageJson = files['package.json'];
  if (packageJson) {
    if (packageJson.type === 'FileFsRef') {
      const packageJsonContent = readFileSync(packageJson.fsPath, 'utf-8');
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
