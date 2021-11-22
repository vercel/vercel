import fs from 'fs-extra';
import { join, dirname, relative } from 'path';
import glob from './fs/glob';
import { normalizePath } from './fs/normalize-path';
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
  return async function build({ workPath }: { workPath: string }) {
    const opts = { cwd: workPath };
    const files = await glob('**', opts);
    delete files['vercel.json']; // Builders/Runtimes didn't have vercel.json
    const entrypoints = await glob(`api/**/*${ext}`, opts);
    const pages: { [key: string]: any } = {};
    const { functions = {} } = await readVercelConfig(workPath);
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

async function readVercelConfig(
  workPath: string
): Promise<{ functions?: BuilderFunctions; regions?: string[] }> {
  const vercelJsonPath = join(workPath, 'vercel.json');
  return readJson(vercelJsonPath);
}

/**
 * If `.output/functions-manifest.json` exists, append to the pages
 * property. Otherwise write a new file. This will also read `vercel.json`
 * and apply relevant `functions` property config.
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
  const vercelConfig = await readVercelConfig(workPath);
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
 * Will append routes to the `routes-manifest.json` file.
 * If the file does not exist, it'll be created.
 */
export async function updateRoutesManifest({
  workPath,
  dynamicRoutes,
}: {
  workPath: string;
  dynamicRoutes?: {
    page: string;
    regex: string;
    namedRegex?: string;
    routeKeys?: { [named: string]: string };
  }[];
}) {
  const routesManifestPath = join(workPath, '.output', 'routes-manifest.json');

  const routesManifest = await readJson(routesManifestPath);

  if (!routesManifest.version) routesManifest.version = 1;
  if (routesManifest.pages404 === undefined) routesManifest.pages404 = true;

  if (dynamicRoutes) {
    if (!routesManifest.dynamicRoutes) routesManifest.dynamicRoutes = [];
    routesManifest.dynamicRoutes.push(...dynamicRoutes);
  }

  await fs.writeFile(routesManifestPath, JSON.stringify(routesManifest));
}
