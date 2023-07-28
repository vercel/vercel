import { readFile, realpath } from 'fs-extra';
import { sep, dirname, join, resolve } from 'path';
import { scanParentDirs } from '@vercel/build-utils';
import { getPkgName } from './pkg-name';

async function getConfigPrefix() {
  const paths = [
    process.env.npm_config_userconfig || process.env.NPM_CONFIG_USERCONFIG,
    join(process.env.HOME || '/', '.npmrc'),
    process.env.npm_config_globalconfig || process.env.NPM_CONFIG_GLOBALCONFIG,
  ].filter(Boolean);

  for (const configPath of paths) {
    if (!configPath) {
      continue;
    }

    const content = await readFile(configPath)
      .then((buffer: Buffer) => buffer.toString())
      .catch(() => null);

    if (content) {
      const [prefix] = content
        .split('\n')
        .map((line: string) => line && line.trim())
        .filter((line: string) => line && line.startsWith('prefix'))
        .map((line: string) => line.slice(line.indexOf('=') + 1).trim());

      if (prefix) {
        return prefix;
      }
    }
  }

  return null;
}

async function isGlobal() {
  try {
    // This is true for e.g. nvm, node path will be equal to now path
    if (dirname(process.argv[0]) === dirname(process.argv[1])) {
      return true;
    }

    const isWindows = process.platform === 'win32';
    const defaultPath = isWindows ? process.env.APPDATA : '/usr/local/lib';

    const installPath = await realpath(resolve(__dirname));

    if (
      installPath.includes(['', 'yarn', 'global', 'node_modules', ''].join(sep))
    ) {
      return true;
    }

    if (installPath.includes(['', 'pnpm', 'global', ''].join(sep))) {
      return true;
    }

    if (installPath.includes(['', 'fnm', 'node-versions', ''].join(sep))) {
      return true;
    }

    const prefixPath =
      process.env.PREFIX ||
      process.env.npm_config_prefix ||
      process.env.NPM_CONFIG_PREFIX ||
      (await getConfigPrefix()) ||
      defaultPath;

    if (!prefixPath) {
      return true;
    }

    return installPath.startsWith(await realpath(prefixPath));
  } catch (_) {
    // Default to global
    return true;
  }
}

export default async function getUpdateCommand(): Promise<string> {
  const pkgAndVersion = `${getPkgName()}@latest`;

  const entrypoint = await realpath(process.argv[1]);
  let { cliType, lockfilePath } = await scanParentDirs(
    dirname(dirname(entrypoint))
  );
  if (!lockfilePath) {
    // Global installs for npm do not have a lockfile
    cliType = 'npm';
  }
  const yarn = cliType === 'yarn';

  let install = yarn ? 'add' : 'i';
  if (await isGlobal()) {
    if (yarn) {
      install = 'global add';
    } else {
      install = 'i -g';
    }
  }

  return `${cliType} ${install} ${pkgAndVersion}`;
}
