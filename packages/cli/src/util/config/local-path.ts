import path from 'path';
import mri from 'mri';
import { InvalidLocalConfig } from '../errors';
import { ConflictingConfigFiles } from '../errors-ts';
import { existsSync } from 'fs';

export default function getLocalPathConfig(prefix: string) {
  const args = mri(process.argv.slice(2), {
    string: ['local-config'],
    alias: {
      'local-config': 'A',
    },
  });

  // If `--local-config` flag was specified, then that takes priority
  const customPath = args['local-config'];
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
