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

  // Otherwise check for compiled vercel.ts, then `vercel.json` or `now.json`.
  // Throw an error if both JSON configs exist.
  const compiledConfigPath = path.join(prefix, VERCEL_DIR, 'vercel.json');
  const vercelConfigPath = path.join(prefix, 'vercel.json');
  const nowConfigPath = path.join(prefix, 'now.json');

  const compiledConfigExists = existsSync(compiledConfigPath);
  const vercelConfigExists = existsSync(vercelConfigPath);
  const nowConfigExists = existsSync(nowConfigPath);

  if (vercelConfigExists && nowConfigExists) {
    throw new ConflictingConfigFiles([vercelConfigPath, nowConfigPath]);
  }

  // If vercel.ts was compiled, use that
  if (compiledConfigExists) {
    return compiledConfigPath;
  }

  if (vercelConfigExists) {
    return vercelConfigPath;
  }

  if (nowConfigExists) {
    return nowConfigPath;
  }

  return vercelConfigPath;
}
