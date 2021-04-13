import path from 'path';
import { existsSync } from 'fs';
import { InvalidLocalConfig } from '../errors';
import { ConflictingConfigFiles } from '../errors-ts';
import getArgs from '../../util/get-args';

export default function getLocalPathConfig(prefix: string) {
  let customPath: string | undefined;

  try {
    const argv = getArgs(process.argv.slice(2), {});
    customPath = argv['--local-config'];
  } catch (_error) {
    // args are optional so consume error
  }

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
