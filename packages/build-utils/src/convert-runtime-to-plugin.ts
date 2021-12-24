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
export function _experimental_convertRuntimeToPlugin(
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

      // Create the parent directory of the API Route that will be created
      // for the current entrypoint inside of `.output/server/pages/api`.
      await fs.ensureDir(dirname(entry));

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
        // source files, so that's what we will use as an import path in the launcher.
        const locationPrefix = relative(entry, outputPath);

        let handlerContent = await fs.readFile(fsPath, encoding);

        const importPaths = [
          // This is the full entrypoint path, like `./api/test.py`. In our tests
          // Python didn't support importing from a parent directory without using different
          // code in the launcher that registers it as a location for modules and then changing
          // the importing syntax, but continuing to import it like before seems to work. If
          // other languages need this, we should consider excluding Python explicitly.
          // `./${entrypoint}`,

          // This is the entrypoint path without extension, like `api/test`
          entrypoint.slice(0, -ext.length),
        ];

        // Generate a list of regular expressions that we can use for
        // finding matches, but only allow matches if the import path is
        // wrapped inside single (') or double quotes (").
        const patterns = importPaths.map(path => {
          // eslint-disable-next-line no-useless-escape
          return new RegExp(`('|")(${path.replace(/\./g, '\\.')})('|")`, 'g');
        });

        let replacedMatch = null;

        for (const pattern of patterns) {
          const newContent = handlerContent.replace(
            pattern,
            (_, p1, p2, p3) => {
              return `${p1}${join(locationPrefix, p2)}${p3}`;
            }
          );

          if (newContent !== handlerContent) {
            debug(
              `Replaced "${pattern}" inside "${entry}" to ensure correct import of user-provided request handler`
            );

            handlerContent = newContent;
            replacedMatch = true;
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

      // Legacy Runtimes based on interpreted languages will create a new launcher file
      // for every entrypoint, but they will create each one inside `workPath`, which means that
      // the launcher for one entrypoint will overwrite the launcher provided for the previous
      // entrypoint. That's why, above, we copy the file contents into the new destination (and
      // optionally transform them along the way), instead of linking. We then also want to remove
      // the copy origin right here, so that the `workPath` doesn't contain a useless launcher file
      // once the build has finished running.
      await fs.remove(handlerFile.fsPath);
      debug(`Removed temporary file "${handlerFile.fsPath}"`);

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

      await fs.writeFile(nft, json);

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

    // Add any Serverless Functions that were exposed by the Legacy Runtime
    // to the `functions-manifest.json` file provided in `.output`.
    await _experimental_updateFunctionsManifest({ workPath, pages });
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

/**
 * If `.output/functions-manifest.json` exists, append to the pages
 * property. Otherwise write a new file.
 */
export async function _experimental_updateFunctionsManifest({
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
export async function _experimental_updateRoutesManifest({
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
