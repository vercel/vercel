import fs from 'fs-extra';
import { join, dirname, parse, relative } from 'path';
import glob from './fs/glob';
import { normalizePath } from './fs/normalize-path';
import { FILES_SYMBOL, Lambda } from './lambda';
import type FileBlob from './file-blob';
import type { BuildOptions, Files } from './types';
import { getIgnoreFilter } from '.';

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

    const traceDir = join(
      workPath,
      `.output`,
      `inputs`,
      // Legacy Runtimes can only provide API Routes, so that's
      // why we can use this prefix for all of them. Here, we have to
      // make sure to not use a cryptic hash name, because people
      // need to be able to easily inspect the output.
      `api-routes-${pluginName}`
    );

    await fs.ensureDir(traceDir);

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

      // Further down, we will need the filename of the Lambda handler
      // for placing it inside `server/pages/api`, but because Legacy Runtimes
      // don't expose the filename directly, we have to construct it
      // from the handler name, and then find the matching file further below,
      // because we don't yet know its extension here.
      const handler = output.handler;
      const handlerMethod = handler.split('.').reverse()[0];
      const handlerFileName = handler.replace(`.${handlerMethod}`, '');

      pages[entrypoint] = {
        handler: handler,
        runtime: output.runtime,
        memory: output.memory,
        maxDuration: output.maxDuration,
        environment: output.environment,
        allowQuery: output.allowQuery,
      };

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

      const handlerFilePath = Object.keys(lambdaFiles).find(item => {
        return parse(item).name === handlerFileName;
      });

      const handlerFileOrigin = lambdaFiles[handlerFilePath || ''].fsPath;

      if (!handlerFileOrigin) {
        throw new Error(
          `Could not find a handler file. Please ensure that the list of \`files\` defined for the returned \`Lambda\` contains a file with the name ${handlerFileName} (+ any extension).`
        );
      }

      const entry = join(workPath, '.output', 'server', 'pages', entrypoint);

      await fs.ensureDir(dirname(entry));
      await linkOrCopy(handlerFileOrigin, entry);

      const toRemove = [];

      // You can find more details about this at the point where the
      // `sourceFilesAfterBuild` is created originally.
      for (const file in sourceFilesAfterBuild) {
        if (!sourceFilesPreBuild[file]) {
          const path = sourceFilesAfterBuild[file].fsPath;
          toRemove.push(fs.remove(path));
        }
      }

      await Promise.all(toRemove);

      const tracedFiles: {
        absolutePath: string;
        relativePath: string;
      }[] = [];

      Object.entries(lambdaFiles).forEach(async ([relPath, file]) => {
        const newPath = join(traceDir, relPath);

        // The handler was already moved into position above.
        if (relPath === handlerFilePath) {
          return;
        }

        tracedFiles.push({ absolutePath: newPath, relativePath: relPath });

        if (file.fsPath) {
          await linkOrCopy(file.fsPath, newPath);
        } else if (file.type === 'FileBlob') {
          const { data, mode } = file as FileBlob;
          await fs.writeFile(newPath, data, { mode });
        } else {
          throw new Error(`Unknown file type: ${file.type}`);
        }
      });

      const nft = join(
        workPath,
        '.output',
        'server',
        'pages',
        `${entrypoint}.nft.json`
      );

      const json = JSON.stringify({
        version: 1,
        files: tracedFiles.map(file => ({
          input: normalizePath(relative(nft, file.absolutePath)),
          output: normalizePath(file.relativePath),
        })),
      });

      await fs.ensureDir(dirname(nft));
      await fs.writeFile(nft, json);
    }

    await updateFunctionsManifest({ workPath, pages });
  };
}

async function linkOrCopy(existingPath: string, newPath: string) {
  try {
    await fs.createLink(existingPath, newPath);
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      await fs.copyFile(existingPath, newPath);
    }
  }
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

  if (!functionsManifest.version) functionsManifest.version = 1;
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
