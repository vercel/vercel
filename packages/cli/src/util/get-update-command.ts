import { realpath } from 'fs-extra';
import { join, sep } from 'path';
import { execFile } from 'child_process';
import { packageName } from './pkg-name';
import { isNativeBinaryInstall } from './native-install';
import {
  trustedUpgradeDirectory,
  trustedUpgradeEnvironment,
} from './upgrade-environment';
import {
  getUpgradePackageManager,
  type PackageManagerName,
} from './upgrade-package-managers';

export type { PackageManagerName } from './upgrade-package-managers';

export interface UpdateCommandInfo {
  command: string;
  global: boolean;
  packageManager: PackageManagerName;
  assumed: false;
}

export class UnsupportedUpgradeInstallError extends Error {}

export const HOMEBREW_UPGRADE_COMMAND = 'brew upgrade vercel';

export class HomebrewInstallError extends UnsupportedUpgradeInstallError {
  constructor() {
    super(
      `This Vercel CLI was installed with Homebrew. Update it with \`${HOMEBREW_UPGRADE_COMMAND}\`.`
    );
  }
}

/**
 * Whether this native binary belongs to the Homebrew `vercel` cask. Homebrew
 * links the binary directly, so the npm package handoff never runs for it.
 */
export async function isHomebrewInstall(): Promise<boolean> {
  if (!isNativeBinaryInstall()) {
    return false;
  }
  const executable = await realpath(process.execPath).catch(
    () => process.execPath
  );
  return executable.includes(`${sep}Caskroom${sep}vercel${sep}`);
}

const globalCliTypes: PackageManagerName[] = ['npm', 'pnpm', 'yarn', 'bun'];

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Package manager detection was aborted');
  }
}

async function getPackageManagerGlobalRoot(
  cliType: PackageManagerName,
  pkg: string,
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const detectionArgs =
      getUpgradePackageManager(cliType).globalDetection.args;
    // The native packager wraps execFile without Node's promisify metadata.
    // Use the callback API so stdout is a string in both runtimes.
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        cliType,
        typeof detectionArgs === 'function'
          ? detectionArgs(pkg)
          : detectionArgs,
        {
          encoding: 'utf8',
          windowsHide: true,
          cwd: trustedUpgradeDirectory,
          timeout: 15000,
          // The native wrapper adds PKG_EXECPATH; keep the trusted snapshot frozen.
          env: { ...env },
          signal,
        },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        }
      );
    });
    const root = stdout.trim();
    return root || null;
  } catch (_) {
    throwIfAborted(signal);
    return null;
  }
}

export async function detectGlobalPackageManager(
  installPath: string,
  pkg: string,
  cliTypes: PackageManagerName[] = globalCliTypes,
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment,
  signal?: AbortSignal
): Promise<PackageManagerName | null> {
  for (const cliType of cliTypes) {
    throwIfAborted(signal);
    const root = await getPackageManagerGlobalRoot(cliType, pkg, env, signal);
    if (!root) continue;

    const detection = getUpgradePackageManager(cliType).globalDetection;
    if (detection.packageDir) {
      try {
        const packageDir = detection.packageDir(root, pkg);
        if (!packageDir) continue;
        const resolvedPackageDir = await realpath(packageDir);
        if (
          installPath === resolvedPackageDir ||
          installPath.startsWith(resolvedPackageDir + sep)
        ) {
          return cliType;
        }
      } catch (_) {
        // This manager is installed, but it does not own this Vercel CLI.
      }
    }

    for (const binary of detection.binaryNames || []) {
      try {
        const target = await realpath(join(root, binary));
        if (
          target === installPath ||
          target.startsWith(installPath + sep) ||
          installPath.startsWith(target + sep)
        ) {
          return cliType;
        }
        const entrypoint = await realpath(process.argv[1]);
        if (!isNativeBinaryInstall() && target === entrypoint) {
          return cliType;
        }
      } catch (_) {
        // A missing or unrelated global binary is not positive detection.
      }
    }
  }

  return null;
}

async function resolveInstall(
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment,
  signal?: AbortSignal
): Promise<{
  packageManager: PackageManagerName;
  global: true;
  assumed: false;
}> {
  throwIfAborted(signal);
  if (await isHomebrewInstall()) {
    throw new HomebrewInstallError();
  }
  // The native executable may be a sibling dependency of vercel. Detect the
  // package that launched it, using the environment captured before dotenv loads.
  // Bind the handoff to that executable so a child Node CLI cannot inherit the
  // parent's package identity when it belongs to a different installation.
  const nativeExecutable =
    isNativeBinaryInstall() && env.VERCEL_CLI_PACKAGE_EXECUTABLE;
  const resolvedNativeExecutable =
    nativeExecutable && (await realpath(nativeExecutable).catch(() => null));
  const isNativeHandoff =
    resolvedNativeExecutable &&
    resolvedNativeExecutable ===
      (await realpath(process.execPath).catch(() => null));
  const entrypoint = isNativeHandoff
    ? env.VERCEL_CLI_PACKAGE_ENTRYPOINT
    : process.argv[1];
  const installPath =
    entrypoint && (await realpath(entrypoint).catch(() => null));
  if (!installPath) {
    throw new UnsupportedUpgradeInstallError(
      'Could not resolve this Vercel CLI installation. Update it with the package manager that installed it.'
    );
  }

  const packageManager = await detectGlobalPackageManager(
    installPath,
    packageName,
    globalCliTypes,
    env,
    signal
  );
  if (!packageManager) {
    throw new UnsupportedUpgradeInstallError(
      'Could not detect a supported global npm, pnpm, Yarn, or Bun installation of Vercel CLI. Update it with the package manager that installed it.'
    );
  }

  return { packageManager, global: true, assumed: false };
}

export async function isGlobal(): Promise<boolean> {
  if (await isHomebrewInstall()) {
    return true;
  }
  try {
    await resolveInstall();
    return true;
  } catch (_) {
    return false;
  }
}

export async function getUpdateCommandInfo(
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment,
  signal?: AbortSignal
): Promise<UpdateCommandInfo> {
  const { packageManager } = await resolveInstall(env, signal);
  const args = getUpgradePackageManager(packageManager).installArgs(
    `${packageName}@latest`
  );
  const allowBuild = pnpmAllowBuildFlag(packageManager, 'esbuild');
  return {
    command: `${packageManager} ${args.join(' ')}${allowBuild}`,
    global: true,
    packageManager,
    assumed: false,
  };
}

function pnpmAllowBuildFlag(cliType: string, pkg: string): string {
  return cliType === 'pnpm' ? ` --allow-build=${pkg}` : '';
}

export default async function getUpdateCommand(): Promise<string> {
  if (await isHomebrewInstall()) {
    return HOMEBREW_UPGRADE_COMMAND;
  }
  return (await getUpdateCommandInfo()).command;
}
