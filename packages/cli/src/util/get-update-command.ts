import { readFile, realpath } from 'fs-extra';
import { sep, dirname, join, resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { scanParentDirs } from '@vercel/build-utils';
import { packageName } from './pkg-name';
import { isNativeBinaryInstall } from './native-install';

const nativePackageName = '@vercel/vc-native';

const execFileAsync = promisify(execFile);

type GlobalCliType = 'npm' | 'pnpm' | 'yarn';

const globalRootQueries: Record<
  GlobalCliType,
  { args: string[]; packageDir: (root: string, pkg: string) => string }
> = {
  npm: { args: ['root', '-g'], packageDir: (root, pkg) => join(root, pkg) },
  pnpm: { args: ['root', '-g'], packageDir: (root, pkg) => join(root, pkg) },
  yarn: {
    args: ['global', 'dir'],
    packageDir: (root, pkg) => join(root, 'node_modules', pkg),
  },
};

async function getPackageManagerGlobalRoot(
  cliType: GlobalCliType
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      cliType,
      globalRootQueries[cliType].args,
      {
        encoding: 'utf8',
        windowsHide: true,
      }
    );
    const root = stdout.trim();
    return root || null;
  } catch (_) {
    return null;
  }
}

async function detectGlobalCliType(
  installPath: string,
  pkg: string
): Promise<GlobalCliType | null> {
  for (const cliType of Object.keys(globalRootQueries) as GlobalCliType[]) {
    const root = await getPackageManagerGlobalRoot(cliType);
    if (!root) {
      continue;
    }

    let resolvedPackageDir: string;
    try {
      resolvedPackageDir = await realpath(
        globalRootQueries[cliType].packageDir(root, pkg)
      );
    } catch (_) {
      continue;
    }

    if (
      installPath === resolvedPackageDir ||
      installPath.startsWith(resolvedPackageDir + sep)
    ) {
      return cliType;
    }
  }

  return null;
}

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

function isGlobalByPath(installPath: string): boolean {
  // This is true for e.g. nvm, node path will be equal to now path
  if (dirname(process.argv[0]) === dirname(process.argv[1])) {
    return true;
  }

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

  return false;
}

async function isGlobalByPrefix(installPath: string): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  const defaultPath = isWindows ? process.env.APPDATA : '/usr/local/lib';

  const prefixPath =
    process.env.PREFIX ||
    process.env.npm_config_prefix ||
    process.env.NPM_CONFIG_PREFIX ||
    (await getConfigPrefix()) ||
    defaultPath;

  if (!prefixPath) {
    return true;
  }

  try {
    return installPath.startsWith(await realpath(prefixPath));
  } catch (_) {
    return true;
  }
}

async function resolveInstall() {
  const pkg = isNativeBinaryInstall() ? nativePackageName : packageName;
  const installPath = await realpath(resolve(__dirname));

  const globalCliType = await detectGlobalCliType(installPath, pkg);
  if (globalCliType) {
    return { cliType: globalCliType, global: true };
  }

  const entrypoint = await realpath(process.argv[1]);
  const { cliType, lockfilePath } = await scanParentDirs(
    dirname(dirname(entrypoint))
  );

  return {
    // Global installs for npm do not have a lockfile
    cliType: lockfilePath ? cliType : 'npm',
    global:
      isGlobalByPath(installPath) || (await isGlobalByPrefix(installPath)),
  };
}

export async function isGlobal(): Promise<boolean> {
  try {
    return (await resolveInstall()).global;
  } catch (_) {
    // Default to global
    return true;
  }
}

export async function getUpdateCommandInfo(): Promise<{
  command: string;
  global: boolean;
}> {
  const nativeInstall = isNativeBinaryInstall();
  const pkgAndVersion = `${nativeInstall ? nativePackageName : packageName}@latest`;

  if (nativeInstall) {
    // The native binary's process.argv[1] points into its virtual filesystem
    // snapshot, so detect the package manager from the real install location.
    const segments = process.execPath.split(sep);
    let cliType: GlobalCliType = 'npm';
    if (segments.includes('pnpm') || segments.includes('.pnpm')) {
      cliType = 'pnpm';
    } else if (segments.includes('yarn') || segments.includes('.yarn')) {
      cliType = 'yarn';
    }
    const install = cliType === 'yarn' ? 'global add' : 'i -g';
    const force = cliType === 'npm' ? ' --force' : '';
    return {
      command: `${cliType} ${install} ${pkgAndVersion}${force}`,
      global: true,
    };
  }

  const { cliType, global } = await resolveInstall();
  const yarn = cliType === 'yarn';

  let install = yarn ? 'add' : 'i';
  if (global) {
    install = yarn ? 'global add' : 'i -g';
  }

  return { command: `${cliType} ${install} ${pkgAndVersion}`, global };
}

export default async function getUpdateCommand(): Promise<string> {
  return (await getUpdateCommandInfo()).command;
}
