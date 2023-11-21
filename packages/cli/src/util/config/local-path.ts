import path from 'node:path';
import { existsSync } from 'node:fs';
import { InvalidLocalConfig } from '../errors.js';
import { ConflictingConfigFiles } from '../errors-ts.js';
import getArgs from '../../util/get-args.js';

export default function getLocalPathConfig(prefix: string) {
  let customPath: string | undefined;

  const argv = getArgs(process.argv.slice(2), {}, { permissive: true });
  customPath = argv['--local-config'];

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

  if (nowConfigExists) {
    return nowConfigPath;
  }

  return vercelConfigPath;
}
