import path from 'path';
import { existsSync } from 'fs';
import { InvalidLocalConfig } from '../errors-ts';
import { ConflictingConfigFiles } from '../errors-ts';
import getArgs from '../../util/get-args';
import { VERCEL_DIR } from '../projects/link';

export default function getLocalPathConfig(prefix: string) {
  const argv = getArgs(process.argv.slice(2), {}, { permissive: true });
  const customPath = argv['--local-config'];

  // If `--local-config` flag was specified, then that takes priority
  if (customPath) {
    if (typeof customPath !== 'string') {
      throw new InvalidLocalConfig(customPath);
    }
    return path.resolve(prefix, customPath);
  }

  // Otherwise check for either `vercel.json` or `now.json`.
  // Throw an error if both exist.
  const vercelConfigPath = path.join(prefix, 'vercel.json');
  const nowConfigPath = path.join(prefix, 'now.json');

  const vercelConfigExists = existsSync(vercelConfigPath);
  const nowConfigExists = existsSync(nowConfigPath);

  if (nowConfigExists && vercelConfigExists) {
    throw new ConflictingConfigFiles([vercelConfigPath, nowConfigPath]);
  }

  // Check for compiled vercel.ts first
  const compiledConfigPath = path.join(prefix, VERCEL_DIR, 'vercel.json');
  const compiledConfigExists = existsSync(compiledConfigPath);

  if (compiledConfigExists) {
    return compiledConfigPath;
  }

  if (nowConfigExists) {
    return nowConfigPath;
  }

  return vercelConfigPath;
}
