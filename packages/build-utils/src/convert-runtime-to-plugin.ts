import fs from 'fs-extra';
import { join, dirname, relative } from 'path';
import glob from './fs/glob';
import { normalizePath } from './fs/normalize-path';
import { FILES_SYMBOL, Lambda } from './lambda';
import type FileBlob from './file-blob';
import type { BuildOptions, Files } from './types';

/**
 * Convert legacy Runtime to a Plugin.
 * @param buildRuntime - a legacy build() function from a Runtime
 * @param ext - the file extension, for example `.py`
 */
export function convertRuntimeToPlugin(
  buildRuntime: (options: BuildOptions) => Promise<{ output: Lambda }>,
  ext: string
) {
  // This `build()` signature should match `plugin.build()` signature in `vercel build`.
  return async function build({ workPath }: { workPath: string }) {
    const opts = { cwd: workPath };
    const files = await glob('**', opts);
    delete files['vercel.json']; // Builders/Runtimes didn't have vercel.json
    const entrypoints = await glob(`api/**/*${ext}`, opts);
    const pages: { [key: string]: any } = {};
    const traceDir = join(workPath, '.output', 'runtime-traced-files');
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

      pages[entrypoint] = {
        handler: output.handler,
        runtime: output.runtime,
        memory: output.memory,
        maxDuration: output.maxDuration,
        environment: output.environment,
        allowQuery: output.allowQuery,
      };

      // @ts-ignore This symbol is a private API
      const lambdaFiles: Files = output[FILES_SYMBOL];

      const entry = join(workPath, '.output', 'server', 'pages', entrypoint);
      await fs.ensureDir(dirname(entry));
      await linkOrCopy(files[entrypoint].fsPath, entry);

      const tracedFiles: {
        absolutePath: string;
        relativePath: string;
      }[] = [];

      Object.entries(lambdaFiles).forEach(async ([relPath, file]) => {
        const newPath = join(traceDir, relPath);
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
        files: tracedFiles.map(f => ({
          input: normalizePath(relative(nft, f.absolutePath)),
          output: normalizePath(f.relativePath),
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
