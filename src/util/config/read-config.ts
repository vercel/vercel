import { CantParseJSONFile } from '../errors-ts';
import readJSONFile from '../read-json-file';
import { Config } from '../../types';
import getLocalConfigPath from './local-path';

export default async function readConfig(file?: string) {
  const pkgFilePath = file || getLocalConfigPath(process.cwd());
  const result = await readJSONFile(pkgFilePath);

  if (result instanceof CantParseJSONFile) {
    return result;
  }

  if (result) {
    return result as Config;
  }

  return null;
}
