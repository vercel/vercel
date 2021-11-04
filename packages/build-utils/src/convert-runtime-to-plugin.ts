import fs from 'fs-extra';
import { join, dirname, parse } from 'path';
import glob from './fs/glob';
import { FILES_SYMBOL, Lambda } from './lambda';
import type FileBlob from './file-blob';
import type { BuildOptions, Files } from './types';

const OUTPUT_DIR = '.output';

/**
 *
 * @param buildRuntime a legacy build() function from a Runtime
 * @param ext the file extension, for example `.py`
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

    for (const entrypoint of Object.keys(entrypoints)) {
      const { output } = await buildRuntime({
        files,
        entrypoint,
        workPath,
        // TODO: Read vercel.json and match includeFiles/excludeFiles
        config: { zeroConfig: true },
      });

      functionsManifest[entrypoint] = {
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

      const { dir, name } = parse(entrypoint);
      const lambdaDir = join(
        workPath,
        OUTPUT_DIR,
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
      join(workPath, OUTPUT_DIR, 'functions-manifest.json'),
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
