import path from 'path';
import { fileNameSymbol } from '@vercel/client';
import {
  CantParseJSONFile,
  CantFindConfig,
  ConflictingConfigFiles,
  WorkingDirectoryDoesNotExist,
} from './errors-ts';
import humanizePath from './humanize-path';
import readJSONFile from './read-json-file';
import readPackage from './read-package';
import { VercelConfig } from './dev/types';
import { Output } from './output';

let config: VercelConfig;

export default async function getConfig(
  output: Output,
  configFile?: string
): Promise<VercelConfig | Error> {
  // If config was already read, just return it
  if (config) {
    return config;
  }

  let localPath: string;
  try {
    localPath = process.cwd();
  } catch (err) {
    if (err.code === 'ENOENT') {
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
    const localConfig = await readJSONFile(localFilePath);
    if (localConfig instanceof CantParseJSONFile) {
      return localConfig;
    }
    if (localConfig !== null) {
      config = localConfig as VercelConfig;
      config[fileNameSymbol] = configFile;
      return config;
    }
  }

  // Then try with `vercel.json` or `now.json` in the same directory
  const vercelFilePath = path.resolve(localPath, 'vercel.json');
  const nowFilePath = path.resolve(localPath, 'now.json');
  const [vercelConfig, nowConfig] = await Promise.all([
    readJSONFile(vercelFilePath),
    readJSONFile(nowFilePath),
  ]);
  if (vercelConfig instanceof CantParseJSONFile) {
    return vercelConfig;
  }
  if (nowConfig instanceof CantParseJSONFile) {
    return nowConfig;
  }
  if (vercelConfig && nowConfig) {
    return new ConflictingConfigFiles([vercelFilePath, nowFilePath]);
  }
  if (vercelConfig !== null) {
    output.debug(`Found config in file "${vercelFilePath}"`);
    config = vercelConfig as VercelConfig;
    config[fileNameSymbol] = 'vercel.json';
    return config;
  }
  if (nowConfig !== null) {
    output.debug(`Found config in file "${nowFilePath}"`);
    config = nowConfig as VercelConfig;
    config[fileNameSymbol] = 'now.json';
    return config;
  }

  // Finally try with the package
  const pkgFilePath = path.resolve(localPath, 'package.json');
  const pkgConfig = await readConfigFromPackage(pkgFilePath);
  if (pkgConfig instanceof CantParseJSONFile) {
    return pkgConfig;
  }
  if (pkgConfig) {
    output.debug(`Found config in package ${pkgFilePath}`);
    config = pkgConfig as VercelConfig;
    config[fileNameSymbol] = 'package.json';
    return config;
  }

  // If we couldn't find the config anywhere return error
  return new CantFindConfig(
    [vercelFilePath, nowFilePath, pkgFilePath].map(humanizePath)
  );
}

async function readConfigFromPackage(file: string) {
  const result = await readPackage(file);
  if (result instanceof CantParseJSONFile) {
    return result;
  }

  return result !== null ? result.now : null;
}
