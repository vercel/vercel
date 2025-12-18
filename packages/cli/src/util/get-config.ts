import path from 'path';
import { fileNameSymbol } from '@vercel/client';
import {
  CantParseJSONFile,
  CantFindConfig,
  WorkingDirectoryDoesNotExist,
} from './errors-ts';
import humanizePath from './humanize-path';
import readJSONFile from './read-json-file';
import type { VercelConfig } from './dev/types';
import { isErrnoException } from '@vercel/error-utils';
import output from '../output-manager';
import {
  compileVercelConfig,
  findSourceVercelConfigFile,
} from './compile-vercel-config';
import { runNpmInstall } from '@vercel/build-utils';
import { initCorepack } from './build/corepack';

let config: VercelConfig;

export default async function getConfig(
  configFile?: string
): Promise<VercelConfig | Error> {
  // If config was already read, just return it
  if (config) {
    return config;
  }

  let localPath: string;
  try {
    localPath = process.cwd();
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return new WorkingDirectoryDoesNotExist();
    }
    throw err;
  }

  // First try with the config supplied by the user via --local-config
  if (configFile) {
    const localFilePath = path.resolve(localPath, configFile);
    output.debug(
      `Found config in provided --local-config path ${localFilePath}`
    );
    const localConfig = await readJSONFile<VercelConfig>(localFilePath);
    if (localConfig instanceof CantParseJSONFile) {
      return localConfig;
    }

    if (localConfig === null) {
      return new CantFindConfig([humanizePath(localFilePath)]);
    }

    config = localConfig;
    config[fileNameSymbol] = configFile;
    return config;
  }

  const vercelFilePath = path.resolve(localPath, 'vercel.json');
  const nowFilePath = path.resolve(localPath, 'now.json');

  // Then try with `vercel.ts`, `vercel.json` or `now.json` in the same directory
  const sourceConfigFile = await findSourceVercelConfigFile(localPath);
  if (sourceConfigFile) {
    await initCorepack({ repoRootPath: localPath });
    output.log(`Installing dependencies before config compilation...`);
    await runNpmInstall(localPath, [], { env: process.env });
  }

  let compileResult;
  try {
    compileResult = await compileVercelConfig(localPath);
  } catch (err) {
    if (err instanceof Error) {
      return err;
    }
    throw err;
  }

  if (compileResult.configPath) {
    const localConfig = await readJSONFile<VercelConfig>(
      compileResult.configPath
    );
    if (localConfig instanceof CantParseJSONFile) {
      return localConfig;
    }
    if (localConfig !== null) {
      const fileName = path.basename(compileResult.configPath);
      output.debug(`Found config in file "${compileResult.configPath}"`);
      config = localConfig;
      config[fileNameSymbol] = compileResult.wasCompiled
        ? compileResult.sourceFile || 'vercel.ts'
        : fileName;
      return config;
    }
  }

  // If we couldn't find the config anywhere return error
  return new CantFindConfig([vercelFilePath, nowFilePath].map(humanizePath));
}
