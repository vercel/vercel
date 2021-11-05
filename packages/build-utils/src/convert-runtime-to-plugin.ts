import fs from 'fs-extra';
import { join, dirname, parse } from 'path';
import glob from './fs/glob';
import { FILES_SYMBOL, Lambda } from './lambda';
import type FileBlob from './file-blob';
import type { BuilderFunctions, BuildOptions, Files } from './types';
import minimatch from 'minimatch';

/**
 * Convert legacy Runtime to a Plugin.
 * @param buildRuntime - a legacy build() function from a Runtime
 * @param ext - the file extension, for example `.py`
 */
export async function convertRuntimeToPlugin(
  buildRuntime: (options: BuildOptions) => Promise<{ output: Lambda }>,
  ext: string
) {
  return async function build({ workPath }: { workPath: string }) {
    const opts = { cwd: workPath };
    const files = await glob('**', opts);
    const entrypoints = await glob(`api/**/*${ext}`, opts);
    const functionsManifest: { [key: string]: any } = {};
    const functions = await readVercelConfigFunctions(workPath);

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

      functionsManifest[entrypoint] = {
        handler: output.handler,
        runtime: output.runtime,
        memory: config.memory || output.memory,
        maxDuration: config.maxDuration || output.maxDuration,
        environment: output.environment,
        allowQuery: output.allowQuery,
        regions: output.regions,
      };

      // @ts-ignore This symbol is a private API
      const lambdaFiles: Files = output[FILES_SYMBOL];

      const { dir, name } = parse(entrypoint);
      const lambdaDir = join(
        workPath,
        '.output',
        'server',
        'pages',
        dir,
        name,
        name === 'index' ? '' : 'index'
      );
      await fs.ensureDir(lambdaDir);

      Object.entries(lambdaFiles).forEach(async ([relPath, file]) => {
        const newPath = join(lambdaDir, relPath);
        await fs.ensureDir(dirname(newPath));
        if (file.fsPath) {
          await linkOrCopy(file.fsPath, newPath);
        } else if (file.type === 'FileBlob') {
          const { data, mode } = file as FileBlob;
          await fs.writeFile(newPath, data, { mode });
        } else {
          throw new Error(`Unknown file type: ${file.type}`);
        }
      });
    }

    await fs.writeFile(
      join(workPath, '.output', 'functions-manifest.json'),
      JSON.stringify(functionsManifest)
    );
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

async function readVercelConfigFunctions(
  workPath: string
): Promise<BuilderFunctions> {
  const vercelJsonPath = join(workPath, 'vercel.json');
  try {
    const str = await fs.readFile(vercelJsonPath, 'utf8');
    const obj = JSON.parse(str);
    return obj.functions || {};
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}
