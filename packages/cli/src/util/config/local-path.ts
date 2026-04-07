import path from 'path';
import { existsSync } from 'fs';
import { InvalidLocalConfig } from '../errors-ts';
import { ConflictingConfigFiles } from '../errors-ts';
import getArgs from '../../util/get-args';
import { VERCEL_DIR } from '../projects/link';
import { isVercelTomlEnabled } from '../is-vercel-toml-enabled';

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

  // Otherwise check for `vercel.json`, `vercel.toml`, or `now.json`.
  // Throw an error if more than one exists.
  const vercelConfigPath = path.join(prefix, 'vercel.json');
  const vercelTomlPath = path.join(prefix, 'vercel.toml');
  const nowConfigPath = path.join(prefix, 'now.json');

  const vercelConfigExists = existsSync(vercelConfigPath);
  const vercelTomlExists = isVercelTomlEnabled() && existsSync(vercelTomlPath);
  const nowConfigExists = existsSync(nowConfigPath);

  const foundConfigs: string[] = [];
  if (vercelConfigExists) foundConfigs.push(vercelConfigPath);
  if (vercelTomlExists) foundConfigs.push(vercelTomlPath);
  if (nowConfigExists) foundConfigs.push(nowConfigPath);

  if (foundConfigs.length > 1) {
    throw new ConflictingConfigFiles(foundConfigs);
  }

  // Check for compiled vercel.ts/vercel.toml first
  const compiledConfigPath = path.join(prefix, VERCEL_DIR, 'vercel.json');
  const compiledConfigExists = existsSync(compiledConfigPath);

  if (compiledConfigExists) {
    return compiledConfigPath;
  }

  // vercel.toml (like vercel.ts) requires compilation — don't return the raw
  // .toml path since downstream code passes it to a JSON-only parser.
  // Fall through to the default vercel.json path (which won't exist, but
  // that's handled gracefully by callers).

  if (nowConfigExists) {
    return nowConfigPath;
  }

  return vercelConfigPath;
}
