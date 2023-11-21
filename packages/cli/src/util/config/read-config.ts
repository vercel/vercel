import { join } from 'node:path';
import { CantParseJSONFile } from '../errors-ts.js';
import readJSONFile from '../read-json-file.js';
import { VercelConfig } from '../dev/types.js';
import getLocalConfigPath from './local-path.js';

export default async function readConfig(dir: string) {
  const pkgFilePath = getLocalConfigPath(join(process.cwd(), dir));
  const result = await readJSONFile<VercelConfig>(pkgFilePath);

  if (result instanceof CantParseJSONFile) {
    return result;
  }

  if (result) {
    return result;
  }

  return null;
}
