import path from 'path';
import {
  CantParseJSONFile,
  CantFindConfig,
  WorkingDirectoryDoesNotExist,
} from './errors-ts';
import humanizePath from './humanize-path';
import readJSONFile from './read-json-file';
import readPackage from './read-package';
import { Config } from '../types';
import { Output } from './output';

let config: Config;

export default async function getConfig(
  output: Output,
  configFile?: string
): Promise<Config | Error> {
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
      config = localConfig;
      return config;
    }
  }

  // Then try with now.json in the same directory
  const nowFilePath = path.resolve(localPath, 'now.json');
  const mainConfig = await readJSONFile(nowFilePath);
  if (mainConfig instanceof CantParseJSONFile) {
    return mainConfig;
  }
  if (mainConfig !== null) {
    output.debug(`Found config in file ${nowFilePath}`);
    const castedConfig = mainConfig;
    config = castedConfig;
    return config;
  }

  // Finally try with the package
  const pkgFilePath = path.resolve(localPath, 'package.json');
  const pkgConfig = await readConfigFromPackage(pkgFilePath);
  if (pkgConfig instanceof CantParseJSONFile) {
    return pkgConfig;
  }
  if (pkgConfig) {
    output.debug(`Found config in package ${nowFilePath}`);
    const castedConfig = pkgConfig;
    config = castedConfig;
    return config;
  }

  // If we couldn't find the config anywhere return error
  return new CantFindConfig([nowFilePath, pkgFilePath].map(humanizePath));
}

async function readConfigFromPackage(file: string) {
  const result = await readPackage(file);
  if (result instanceof CantParseJSONFile) {
    return result;
  }

  return result !== null ? result.now : null;
}
