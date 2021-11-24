import fs from 'fs-extra';
import { join, dirname, relative } from 'path';
import glob from './fs/glob';
import { normalizePath } from './fs/normalize-path';
import { detectBuilders } from './detect-builders';
import { FILES_SYMBOL, getLambdaOptionsFromFunction, Lambda } from './lambda';
import type FileBlob from './file-blob';
import type { BuilderFunctions, BuildOptions, Files } from './types';
import minimatch from 'minimatch';

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
  return async function build({
    vercelConfig,
    workPath,
  }: {
    vercelConfig: {
      functions?: BuilderFunctions;
      regions?: string[];
      trailingSlash?: boolean;
      cleanUrls?: boolean;
    };
    workPath: string;
  }) {
    const opts = { cwd: workPath };
    const files = await glob('**', opts);
    delete files['vercel.json']; // Builders/Runtimes didn't have vercel.json
    const entrypoints = await glob(`api/**/*${ext}`, opts);
    const pages: { [key: string]: any } = {};
    const { functions = {}, cleanUrls, trailingSlash } = vercelConfig;
    const traceDir = join(workPath, '.output', 'runtime-traced-files');
    await fs.ensureDir(traceDir);

    for (const entrypoint of Object.keys(entrypoints)) {
      const key =
        Object.keys(functions).find(
          src => src === entrypoint || minimatch(entrypoint, src)
        ) || '';
      const config = functions[key] || {};

      const { output } = await buildRuntime({
        files,
        entrypoint,
        workPath,
        config: {
          zeroConfig: true,
          includeFiles: config.includeFiles,
          excludeFiles: config.excludeFiles,
        },
      });

      pages[entrypoint] = {
        handler: output.handler,
        runtime: output.runtime,
        memory: output.memory,
        maxDuration: output.maxDuration,
        environment: output.environment,
        allowQuery: output.allowQuery,
        regions: output.regions,
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

    await updateFunctionsManifest({ vercelConfig, workPath, pages });

    const {
      warnings,
      errors,
      defaultRoutes,
      redirectRoutes,
      rewriteRoutes,
      // errorRoutes, already handled by pages404
    } = await detectBuilders(Object.keys(files), null, {
      tag: 'latest',
      functions: functions,
      projectSettings: undefined,
      featHandleMiss: true,
      cleanUrls,
      trailingSlash,
    });

    if (errors) {
      throw new Error(errors[0].message);
    }

    if (warnings) {
      warnings.forEach(warning => console.warn(warning.message, warning.link));
    }

    const redirects = redirectRoutes?.map(r => ({
      source: r.src || '',
      destination:
        'headers' in r && r.headers?.Location ? r.headers.Location : '',
      statusCode: 'status' in r && r.status ? r.status : 307,
      regex: r.src || '',
    }));

    const rewrites = rewriteRoutes?.map(r => ({
      source: r.src || '',
      destination: r.dest || '',
      regex: r.src || '',
    }));

    const dynamicRoutes = defaultRoutes?.map(r => ({
      page: r.src || '',
      regex: r.src || '',
    }));

    await updateRoutesManifest({
      workPath,
      redirects,
      rewrites,
      dynamicRoutes,
    });
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
 * property. Otherwise write a new file. This will also read `vercel.json`
 * and apply relevant `functions` property config.
 */
export async function updateFunctionsManifest({
  vercelConfig,
  workPath,
  pages,
}: {
  vercelConfig: { functions?: BuilderFunctions; regions?: string[] };
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
    const fnConfig = await getLambdaOptionsFromFunction({
      sourceFile: pageKey,
      config: vercelConfig,
    });
    functionsManifest.pages[pageKey] = {
      ...pageConfig,
      memory: fnConfig.memory || pageConfig.memory,
      maxDuration: fnConfig.maxDuration || pageConfig.maxDuration,
      regions: vercelConfig.regions || pageConfig.regions,
    };
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
