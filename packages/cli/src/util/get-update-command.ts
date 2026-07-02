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

/**
 * Detects a pnpm global install by checking whether the CLI is running from
 * inside `PNPM_HOME`. This is the most reliable signal for pnpm because it is
 * independent of pnpm's global layout, which changes across major versions:
 * pnpm ≤10 uses `{PNPM_HOME}/global/5/.pnpm/...` while pnpm 11+ uses isolated
 * installs under `{PNPM_HOME}/global/v11/{hash}/` whose realpath resolves into
 * the global virtual store at `{storeDir}/links/...`. Additionally,
 * `pnpm root -g` cannot be trusted here: on machines upgraded from pnpm ≤10 it
 * keeps answering with the stale `global/5` layout (pnpm does not migrate it,
 * see pnpm/pnpm#11528), so the query-based detection misses v11 installs.
 *
 * On clean pnpm 11 machines the query fails differently but just as fatally:
 * `pnpm root -g` answers with the parent of the isolated install dirs (e.g.
 * `{PNPM_HOME}/global/v11`), which is not a node_modules directory, so
 * `join(root, pkg)` never resolves to an existing path.
 *
 * The unresolved entrypoint (`process.argv[1]`) is checked as well as the
 * realpath'd install dir: pnpm 11 bin shims exec a target inside `PNPM_HOME`,
 * while its realpath may escape into a relocated store directory.
 */
async function isPnpmHomeInstall(installPath: string): Promise<boolean> {
  const pnpmHome = process.env.PNPM_HOME;
  if (!pnpmHome) {
    return false;
  }

  const candidates = [pnpmHome];
  try {
    candidates.push(await realpath(pnpmHome));
  } catch (_) {
    // PNPM_HOME set but unresolvable; fall through with the raw value
  }

  const entrypoint = process.argv[1];
  for (const home of candidates) {
    const prefix = home.endsWith(sep) ? home : home + sep;
    if (entrypoint?.startsWith(prefix) || installPath.startsWith(prefix)) {
      return true;
    }
  }

  return false;
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

  // pnpm 11+ global virtual store: installs realpath into
  // `.../pnpm/store/v{N}/links/...`
  if (
    installPath.includes(['', 'pnpm', 'store', ''].join(sep)) &&
    installPath.includes(sep + 'links' + sep)
  ) {
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

  if (await isPnpmHomeInstall(installPath)) {
    return { cliType: 'pnpm' as const, global: true };
  }

  const globalCliType = await detectGlobalCliType(installPath, pkg);
  if (globalCliType) {
    return { cliType: globalCliType, global: true };
  }

  // The entrypoint may not resolve on disk (e.g. inside a virtual filesystem
  // snapshot); treat that the same as finding no lockfile rather than crashing.
  let lockfileCliType: string | undefined;
  try {
    const entrypoint = await realpath(process.argv[1]);
    const { cliType, lockfilePath } = await scanParentDirs(
      dirname(dirname(entrypoint))
    );
    if (lockfilePath) {
      lockfileCliType = cliType;
    }
  } catch (_) {
    // fall through to the global npm default below
  }

  // A genuine local (project-dependency) install always has a lockfile above
  // the CLI's install location. Without that positive evidence, never
  // classify as local: a local classification makes the upgrade run
  // `<pm> i vercel@latest` in the user's current directory, which mutates
  // whatever project they happen to be standing in. Unknown layouts (e.g.
  // future package manager changes) must degrade to a global upgrade, which
  // runs from a temp dir and cannot touch the cwd.
  if (!lockfileCliType) {
    // Global installs for npm do not have a lockfile
    return { cliType: 'npm' as const, global: true };
  }

  return {
    cliType: lockfileCliType,
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
