import fs from 'fs-extra';
import { join, dirname } from 'path';
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
    const opts = { cwd: workPath };
    const files = await glob('**', opts);

    // We also don't want to provide any files to Runtimes that were ignored
    // through `.vercelignore` or `.nowignore`, because the Build Step does the same.
    const ignoreFilter = await getIgnoreFilter(workPath);

    // We're not passing this as an `ignore` filter to the `glob` function above,
    // so that we can re-use exactly the same `getIgnoreFilter` method that the
    // Build Step uses (literally the same code). Note that this exclusion only applies
    // when deploying. Locally, another exclusion further below is needed.
    for (const file in files) {
      if (shouldIgnorePath(file, ignoreFilter, true)) {
        delete files[file];
      }
    }

    const entrypointPattern = `api/**/*${ext}`;
    const entrypoints = await glob(entrypointPattern, opts);
    const pages: { [key: string]: any } = {};
    const pluginName = packageName.replace('vercel-plugin-', '');

    const traceDirInputs = join(
      `inputs`,
      // Legacy Runtimes can only provide API Routes, so that's
      // why we can use this prefix for all of them. Here, we have to
      // make sure to not use a cryptic hash name, because people
      // need to be able to easily inspect the output.
      `api-routes-${pluginName}`
    );

    const traceDir = join(workPath, `.output`, traceDirInputs);

    await fs.ensureDir(traceDir);

    for (const entrypoint of Object.keys(entrypoints)) {
      const { output } = await buildRuntime({
        files,
        entrypoint,
        workPath,
        config: {
          zeroConfig: true,
        },
        meta: {
          avoidTopLevelInstall: true,
        },
      });

      const handler = output.handler;
      const handlerMethod = handler.split('.').reverse()[0];
      const handlerFile = handler.replace(`.${handlerMethod}`, '');

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

      const entry = join(workPath, '.output', 'server', 'pages', entrypoint);
      await fs.ensureDir(dirname(entry));
      await linkOrCopy(files[handlerFile].fsPath, entry);

      const tracedFiles: string[] = [];

      Object.entries(lambdaFiles).forEach(async ([relPath, file]) => {
        const newPath = join(traceDir, relPath);

        if (newPath !== handlerFile) {
          tracedFiles.push(relPath);
        }

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
        files: tracedFiles.map(file => {
          return {
            input: normalizePath(join('../../..', traceDirInputs, file)),
            output: normalizePath(file),
          };
        }),
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
