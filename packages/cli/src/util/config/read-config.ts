import { CantParseJSONFile } from '../errors-ts';
import readJSONFile from '../read-json-file';
import type { VercelConfig } from '../dev/types';
import getLocalConfigPath from './local-path';

export default async function readConfig(dir: string) {
  const pkgFilePath = getLocalConfigPath(dir);
  const result = await readJSONFile<VercelConfig>(pkgFilePath);

  if (result instanceof CantParseJSONFile) {
    return result;
  }

  if (result) {
    return result;
  }

  return null;
}
