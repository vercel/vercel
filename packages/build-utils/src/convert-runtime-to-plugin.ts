import fs from 'fs-extra';
import { join, dirname, relative } from 'path';
import glob from './fs/glob';
import { normalizePath } from './fs/normalize-path';
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
    const dir = join(workPath, OUTPUT_DIR, 'inputs', 'runtime-temp');
    await fs.ensureDir(dir);
    for (const entrypoint of Object.keys(entrypoints)) {
      const { output } = await buildRuntime({
        files,
        entrypoint,
        workPath,
        // TODO: What about includeFiles/excludeFiles?
        config: { zeroConfig: true },
      });

      // @ts-ignore This symbol is a private API
      const lambdaFiles: Files = output[FILES_SYMBOL];
      const newFiles: {
        absolutePath: string;
        relativePath: string;
      }[] = [];

      Object.entries(lambdaFiles).forEach(async ([relPath, file]) => {
        const newPath = join(dir, relPath);
        newFiles.push({ absolutePath: newPath, relativePath: relPath });
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

      const nft = join(
        workPath,
        OUTPUT_DIR,
        'server',
        'pages',
        `${entrypoint}.nft.json`
      );
      const json = JSON.stringify({
        version: 1,
        files: newFiles.map(f => ({
          input: normalizePath(relative(nft, f.absolutePath)),
          output: normalizePath(f.relativePath),
        })),
      });

      await fs.ensureDir(dirname(nft));
      await fs.writeFile(nft, json);
    }
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
