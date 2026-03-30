import { CantParseJSONFile } from '../errors-ts';
import readJSONFile from '../read-json-file';
import type { VercelConfig } from '../dev/types';
import getLocalConfigPath from './local-path';
import { compileVercelConfig } from '../compile-vercel-config';

export default async function readConfig(dir: string) {
  let pkgFilePath: string;

  try {
    const compileResult = await compileVercelConfig(dir);
    pkgFilePath = compileResult.configPath || getLocalConfigPath(dir);
  } catch (err) {
    if (err instanceof Error) {
      return err as any;
    }
    throw err;
  }

  const result = await readJSONFile<VercelConfig>(pkgFilePath);

  if (result instanceof CantParseJSONFile) {
    return result;
  }

  if (result) {
    return result;
  }

  return null;
}
