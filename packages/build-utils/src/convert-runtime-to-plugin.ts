import fs from 'fs-extra';
import { join, parse, relative, dirname, basename, extname } from 'path';
import glob from './fs/glob';
import { normalizePath } from './fs/normalize-path';
import { FILES_SYMBOL, Lambda } from './lambda';
import type { BuildOptions, Files } from './types';
import { debug, getIgnoreFilter } from '.';

// `.output` was already created by the Build Command, so we have
// to ensure its contents don't get bundled into the Lambda. Similarily,
// we don't want to bundle anything from `.vercel` either. Lastly,
// Builders/Runtimes didn't have `vercel.json` or `now.json`.
const ignoredPaths = ['.output', '.vercel', 'vercel.json', 'now.json'];

const shouldIgnorePath = (
  file: string,
  ignoreFilter: any,
  ignoreFile: boolean
) => {
  const isNative = ignoredPaths.some(item => {
    return file.startsWith(item);
  });

  if (!ignoreFile) {
    return isNative;
  }

  return isNative || ignoreFilter(file);
};

const getSourceFiles = async (workPath: string, ignoreFilter: any) => {
  const list = await glob('**', {
    cwd: workPath,
  });

  // We're not passing this as an `ignore` filter to the `glob` function above,
  // so that we can re-use exactly the same `getIgnoreFilter` method that the
  // Build Step uses (literally the same code). Note that this exclusion only applies
  // when deploying. Locally, another exclusion is needed, which is handled
  // further below in the `convertRuntimeToPlugin` function.
  for (const file in list) {
    if (shouldIgnorePath(file, ignoreFilter, true)) {
      delete list[file];
    }
  }

  return list;
};

/**
 * Convert legacy Runtime to a Plugin.
 * @param buildRuntime - a legacy build() function from a Runtime
 * @param packageName - the name of the package, for example `vercel-plugin-python`
 * @param ext - the file extension, for example `.py`
 */
export function convertRuntimeToPlugin(
  buildRuntime: (options: BuildOptions) => Promise<{ output: Lambda }>,
  packageName: string,
  ext: string
) {
  // This `build()` signature should match `plugin.build()` signature in `vercel build`.
  return async function build({ workPath }: { workPath: string }) {
    // We also don't want to provide any files to Runtimes that were ignored
    // through `.vercelignore` or `.nowignore`, because the Build Step does the same.
    const ignoreFilter = await getIgnoreFilter(workPath);

    // Retrieve the files that are currently available on the File System,
    // before the Legacy Runtime has even started to build.
    const sourceFilesPreBuild = await getSourceFiles(workPath, ignoreFilter);

    // Instead of doing another `glob` to get all the matching source files,
    // we'll filter the list of existing files down to only the ones
    // that are matching the entrypoint pattern, so we're first creating
    // a clean new list to begin.
    const entrypoints = Object.assign({}, sourceFilesPreBuild);

    const entrypointMatch = new RegExp(`^api/.*${ext}$`);

    // Up next, we'll strip out the files from the list of entrypoints
    // that aren't actually considered entrypoints.
    for (const file in entrypoints) {
      if (!entrypointMatch.test(file)) {
        delete entrypoints[file];
      }
    }

    const pages: { [key: string]: any } = {};
    const pluginName = packageName.replace('vercel-plugin-', '');
    const outputPath = join(workPath, '.output');

    const traceDir = join(
      outputPath,
      `inputs`,
      // Legacy Runtimes can only provide API Routes, so that's
      // why we can use this prefix for all of them. Here, we have to
      // make sure to not use a cryptic hash name, because people
      // need to be able to easily inspect the output.
      `api-routes-${pluginName}`
    );

    await fs.ensureDir(traceDir);

    let newPathsRuntime: Set<string> = new Set();

    const entryRoot = join(outputPath, 'server', 'pages');

    for (const entrypoint of Object.keys(entrypoints)) {
      const { output } = await buildRuntime({
        files: sourceFilesPreBuild,
        entrypoint,
        workPath,
        config: {
          zeroConfig: true,
        },
        meta: {
          avoidTopLevelInstall: true,
          skipDownload: true,
        },
      });

      // Legacy Runtimes tend to pollute the `workPath` with compiled results,
      // because the `workPath` used to be a place that was a place where they could
      // just put anything, but nowadays it's the working directory of the `vercel build`
      // command, which is the place where the developer keeps their source files,
      // so we don't want to pollute this space unnecessarily. That means we have to clean
      // up files that were created by the build, which is done further below.
      const sourceFilesAfterBuild = await getSourceFiles(
        workPath,
        ignoreFilter
      );

      // @ts-ignore This symbol is a private API
      const lambdaFiles: Files = output[FILES_SYMBOL];

      // When deploying, the `files` that are passed to the Legacy Runtimes already
      // have certain files that are ignored stripped, but locally, that list of
      // files isn't used by the Legacy Runtimes, so we need to apply the filters
      // to the outputs that they are returning instead.
      for (const file in lambdaFiles) {
        if (shouldIgnorePath(file, ignoreFilter, false)) {
          delete lambdaFiles[file];
        }
      }

      let handlerFileBase = output.handler;
      let handlerFile = lambdaFiles[handlerFileBase];
      let handlerHasImport = false;

      const { handler } = output;
      const handlerMethod = handler.split('.').pop();
      const handlerFileName = handler.replace(`.${handlerMethod}`, '');

      // For compiled languages, the launcher file for the Lambda generated
      // by the Legacy Runtime matches the `handler` defined for it, but for
      // interpreted languages, the `handler` consists of the launcher file name
      // without an extension, plus the name of the method inside of that file
      // that should be invoked, so we have to construct the file path explicitly.
      if (!handlerFile) {
        handlerFileBase = handlerFileName + ext;
        handlerFile = lambdaFiles[handlerFileBase];
        handlerHasImport = true;
      }

      if (!handlerFile || !handlerFile.fsPath) {
        throw new Error(
          `Could not find a handler file. Please ensure that \`files\` for the returned \`Lambda\` contains an \`FileFsRef\` named "${handlerFileBase}" with a valid \`fsPath\`.`
        );
      }

      const handlerExtName = extname(handlerFile.fsPath);

      const entryBase = basename(entrypoint).replace(ext, handlerExtName);
      const entryPath = join(dirname(entrypoint), entryBase);
      const entry = join(entryRoot, entryPath);

      // We never want to link here, only copy, because the launcher
      // file often has the same name for every entrypoint, which means that
      // every build for every entrypoint overwrites the launcher of the previous
      // one, so linking would end with a broken reference.
      await fs.ensureDir(dirname(entry));
      await fs.copy(handlerFile.fsPath, entry);

      // For compiled languages, the launcher file will be binary and therefore
      // won't try to import a user-provided request handler (instead, it will
      // contain it). But for interpreted languages, the launcher might try to
      // load a user-provided request handler from the source file instead of bundling
      // it, so we have to adjust the import statement inside the launcher to point
      // to the respective source file. Previously, Legacy Runtimes simply expected
      // the user-provided request-handler to be copied right next to the launcher,
      // but with the new File System API, files won't be moved around unnecessarily.
      if (handlerHasImport) {
        const { fsPath } = handlerFile;
        const encoding = 'utf-8';

        // This is the true directory of the user-provided request handler in the
        // source files, so that's what we will use as a import path in the launcher.
        const locationPrefix = relative(entry, outputPath);

        let handlerContent = await fs.readFile(fsPath, encoding);

        const importPaths = [
          // This is the full entrypoint path, like `./api/test.py`
          `./${entrypoint}`,
          // This is the entrypoint path without extension, like `api/test`
          entrypoint.replace(ext, ''),
        ];

        // Generate a list of regular expressions that we can use for
        // finding matches, but only allow matches if the import path is
        // wrapped inside single (') or double quotes (").
        const patterns = importPaths.map(path => {
          // eslint-disable-next-line no-useless-escape
          return new RegExp(`('|")${path.replace(/\./g, '\\.')}('|")`, 'g');
        });

        let replacedMatch = null;

        for (const pattern of patterns) {
          const matches = handlerContent.matchAll(pattern);

          for (const match of matches) {
            // The import path without quotes
            const oldPath = match[0].substr(1, match[0].length - 1);
            const newPath = join(locationPrefix, oldPath);

            if (!match.index) {
              throw new Error('Missing `index` for match');
            }

            handlerContent = replaceAt(
              handlerContent,
              // We'd like to add one character to the index, to consider
              // that the import path is wrapped in quotes.
              match.index + 1,
              oldPath,
              newPath
            );

            debug(
              `Replaced "${oldPath}" inside "${entry}" with "${newPath}" to ensure correct import of user-provided request handler`
            );

            replacedMatch = match;
          }
        }

        if (!replacedMatch) {
          new Error(
            `No replacable matches for "${importPaths[0]}" or "${importPaths[1]}" found in "${fsPath}"`
          );
        }

        await fs.writeFile(entry, handlerContent, encoding);
      } else {
        await fs.copy(handlerFile.fsPath, entry);
      }

      const newFilesEntrypoint: Array<string> = [];
      const newDirectoriesEntrypoint: Array<string> = [];

      const preBuildFiles = Object.values(sourceFilesPreBuild).map(file => {
        return file.fsPath;
      });

      // Generate a list of directories and files that weren't present
      // before the entrypoint was processed by the Legacy Runtime, so
      // that we can perform a cleanup later. We need to divide into files
      // and directories because only cleaning up files might leave empty
      // directories, and listing directories separately also speeds up the
      // build because we can just delete them, which wipes all of their nested
      // paths, instead of iterating through all files that should be deleted.
      for (const file in sourceFilesAfterBuild) {
        if (!sourceFilesPreBuild[file]) {
          const path = sourceFilesAfterBuild[file].fsPath;
          const dirPath = dirname(path);

          // If none of the files that were present before the entrypoint
          // was processed are contained within the directory we're looking
          // at right now, then we know it's a newly added directory
          // and it can therefore be removed later on.
          const isNewDir = !preBuildFiles.some(filePath => {
            return dirname(filePath).startsWith(dirPath);
          });

          // Check out the list of tracked directories that were
          // newly added and see if one of them contains the path
          // we're looking at.
          const hasParentDir = newDirectoriesEntrypoint.some(dir => {
            return path.startsWith(dir);
          });

          // If we have already tracked a directory that was newly
          // added that sits above the file or directory that we're
          // looking at, we don't need to add more entries to the list
          // because when the parent will get removed in the future,
          // all of its children (and therefore the path we're looking at)
          // will automatically get removed anyways.
          if (hasParentDir) {
            continue;
          }

          if (isNewDir) {
            newDirectoriesEntrypoint.push(dirPath);
          } else {
            newFilesEntrypoint.push(path);
          }
        }
      }

      const nft = `${entry}.nft.json`;

      const json = JSON.stringify({
        version: 2,
        files: Object.keys(lambdaFiles)
          .map(file => {
            const { fsPath } = lambdaFiles[file];

            if (!fsPath) {
              throw new Error(
                `File "${file}" is missing valid \`fsPath\` property`
              );
            }

            // The handler was already moved into position above.
            if (file === handlerFileBase) {
              return;
            }

            return normalizePath(relative(dirname(nft), fsPath));
          })
          .filter(Boolean),
      });

      await fs.ensureDir(dirname(nft));
      await fs.writeFile(nft, json);

      // Extend the list of directories and files that were created by the
      // Legacy Runtime with the list of directories and files that were
      // created for the entrypoint that was just processed above.
      newPathsRuntime = new Set([
        ...newPathsRuntime,
        ...newFilesEntrypoint,
        ...newDirectoriesEntrypoint,
      ]);

      // Add an entry that will later on be added to the `functions-manifest.json`
      // file that is placed inside of the `.output` directory.
      pages[normalizePath(entryPath)] = {
        // Because the underlying file used as a handler was placed
        // inside `.output/server/pages/api`, it no longer has the name it originally
        // had and is now named after the API Route that it's responsible for,
        // so we have to adjust the name of the Lambda handler accordingly.
        handler: handler.replace(handlerFileName, parse(entry).name),
        runtime: output.runtime,
        memory: output.memory,
        maxDuration: output.maxDuration,
        environment: output.environment,
        allowQuery: output.allowQuery,
      };
    }

    // A list of all the files that were created by the Legacy Runtime,
    // which we'd like to remove from the File System.
    const toRemove = Array.from(newPathsRuntime).map(path => {
      debug(`Removing ${path} as part of cleanup`);
      return fs.remove(path);
    });

    // Once all the entrypoints have been processed, we'd like to
    // remove all the files from `workPath` that originally weren't present
    // before the Legacy Runtime began running, because the `workPath`
    // is nowadays the directory in which the user keeps their source code, since
    // we're no longer running separate parallel builds for every Legacy Runtime.
    await Promise.all(toRemove);

    // Add any Serverless Functions that were exposed by the Legacy Runtime
    // to the `functions-manifest.json` file provided in `.output`.
    await updateFunctionsManifest({ workPath, pages });
  };
}

async function readJson(filePath: string): Promise<{ [key: string]: any }> {
  try {
    const str = await fs.readFile(filePath, 'utf8');
    return JSON.parse(str);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

function replaceAt(
  content: string,
  index: number,
  match: string,
  replacement: string
) {
  const before = content.substr(0, index);
  const after = content.substr(index + match.length);

  return before + replacement + after;
}

/**
 * If `.output/functions-manifest.json` exists, append to the pages
 * property. Otherwise write a new file.
 */
export async function updateFunctionsManifest({
  workPath,
  pages,
}: {
  workPath: string;
  pages: { [key: string]: any };
}) {
  const functionsManifestPath = join(
    workPath,
    '.output',
    'functions-manifest.json'
  );
  const functionsManifest = await readJson(functionsManifestPath);

  if (!functionsManifest.version) functionsManifest.version = 2;
  if (!functionsManifest.pages) functionsManifest.pages = {};

  for (const [pageKey, pageConfig] of Object.entries(pages)) {
    functionsManifest.pages[pageKey] = { ...pageConfig };
  }

  await fs.writeFile(functionsManifestPath, JSON.stringify(functionsManifest));
}

/**
 * Append routes to the `routes-manifest.json` file.
 * If the file does not exist, it will be created.
 */
export async function updateRoutesManifest({
  workPath,
  redirects,
  rewrites,
  headers,
  dynamicRoutes,
  staticRoutes,
}: {
  workPath: string;
  redirects?: {
    source: string;
    destination: string;
    statusCode: number;
    regex: string;
  }[];
  rewrites?: {
    source: string;
    destination: string;
    regex: string;
  }[];
  headers?: {
    source: string;
    headers: {
      key: string;
      value: string;
    }[];
    regex: string;
  }[];
  dynamicRoutes?: {
    page: string;
    regex: string;
    namedRegex?: string;
    routeKeys?: { [named: string]: string };
  }[];
  staticRoutes?: {
    page: string;
    regex: string;
    namedRegex?: string;
    routeKeys?: { [named: string]: string };
  }[];
}) {
  const routesManifestPath = join(workPath, '.output', 'routes-manifest.json');

  const routesManifest = await readJson(routesManifestPath);

  if (!routesManifest.version) routesManifest.version = 3;
  if (routesManifest.pages404 === undefined) routesManifest.pages404 = true;

  if (redirects) {
    if (!routesManifest.redirects) routesManifest.redirects = [];
    routesManifest.redirects.push(...redirects);
  }

  if (rewrites) {
    if (!routesManifest.rewrites) routesManifest.rewrites = [];
    routesManifest.rewrites.push(...rewrites);
  }

  if (headers) {
    if (!routesManifest.headers) routesManifest.headers = [];
    routesManifest.headers.push(...headers);
  }

  if (dynamicRoutes) {
    if (!routesManifest.dynamicRoutes) routesManifest.dynamicRoutes = [];
    routesManifest.dynamicRoutes.push(...dynamicRoutes);
  }

  if (staticRoutes) {
    if (!routesManifest.staticRoutes) routesManifest.staticRoutes = [];
    routesManifest.staticRoutes.push(...staticRoutes);
  }

  await fs.writeFile(routesManifestPath, JSON.stringify(routesManifest));
}
