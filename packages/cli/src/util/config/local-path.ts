import path from 'path';
import { existsSync } from 'fs';
import { DeprecatedNowJson } from '../errors-ts';
import { InvalidLocalConfig } from '../errors-ts';
import { ConflictingConfigFiles } from '../errors-ts';
import { parseArguments } from '../../util/get-args';
import { VERCEL_DIR } from '../projects/link';

/**
 * The config file `--local-config` names, resolved against the invocation's
 * cwd. It's read as is: no vercel.ts is compiled in its place or beside it.
 */
export function localConfigFlagPath(): string | undefined {
  const argv = parseArguments(process.argv.slice(2), {}, { permissive: true });
  const customPath = argv.flags['--local-config'];
  if (!customPath) return undefined;
  if (typeof customPath !== 'string') {
    throw new InvalidLocalConfig(customPath);
  }
  return path.resolve(process.cwd(), customPath);
}

export default function getLocalPathConfig(
  prefix: string,
  useCompiledConfig = true
) {
  // If `--local-config` flag was specified, then that takes priority
  const customPath = localConfigFlagPath();
  if (customPath) return customPath;

  // Otherwise check for `vercel.json` or `vercel.toml`.
  // `now.json` is no longer supported.
  const vercelConfigPath = path.join(prefix, 'vercel.json');
  const vercelTomlPath = path.join(prefix, 'vercel.toml');
  const nowConfigPath = path.join(prefix, 'now.json');

  const vercelConfigExists = existsSync(vercelConfigPath);
  const vercelTomlExists = existsSync(vercelTomlPath);
  const nowConfigExists = existsSync(nowConfigPath);

  const foundConfigs: string[] = [];
  if (vercelConfigExists) foundConfigs.push(vercelConfigPath);
  if (vercelTomlExists) foundConfigs.push(vercelTomlPath);

  if (nowConfigExists) {
    throw new DeprecatedNowJson(nowConfigPath);
  }

  if (foundConfigs.length > 1) {
    throw new ConflictingConfigFiles(foundConfigs);
  }

  // Check for compiled vercel.ts/vercel.toml first
  const compiledConfigPath = path.join(prefix, VERCEL_DIR, 'vercel.json');
  const compiledConfigExists = existsSync(compiledConfigPath);

  if (useCompiledConfig && compiledConfigExists) {
    return compiledConfigPath;
  }

  // vercel.toml (like vercel.ts) requires compilation — don't return the raw
  // .toml path since downstream code passes it to a JSON-only parser.
  // Fall through to the default vercel.json path (which won't exist, but
  // that's handled gracefully by callers).

  return vercelConfigPath;
}
