import pkg from './pkg';
import { getInstallRoot, isNativeBinaryInstall } from './native-install';
import {
  CURL_INSTALL_COMMAND,
  isCurlInstall,
  readNativeInstallState,
} from './native-self-update';
import {
  getUpdateCommandInfo,
  HOMEBREW_UPGRADE_COMMAND,
  isHomebrewInstall,
  type PackageManagerName,
} from './get-update-command';

export { CURL_INSTALL_COMMAND };
export type { PackageManagerName };

/** Homebrew installs the native binary but has no npm-style upgrade metadata. */
export type VersionPackageManager = PackageManagerName | 'homebrew';

export type CliRuntime = 'native' | 'node';
export type VersionManager = 'installer' | 'package-manager';

interface VersionContextBase {
  /** The version this process reports (`package.json` / `--version`). */
  version: string;
  /** Whether this process is the native binary or the Node.js CLI. */
  runtime: CliRuntime;
}

export interface InstallerVersionContext extends VersionContextBase {
  runtime: 'native';
  manager: 'installer';
  canSwitchVersions: true;
  installRoot: string;
  track: 'production' | 'pr' | undefined;
  slot: 'a' | 'b' | undefined;
  activeVersion: string | undefined;
  pendingProduction:
    | {
        slot: 'a' | 'b';
        version: string;
      }
    | undefined;
  prBuild:
    | {
        number: number;
        sha: string | undefined;
      }
    | undefined;
}

interface SupportedPackageManagerVersionContext extends VersionContextBase {
  manager: 'package-manager';
  canSwitchVersions: false;
  packageManager: VersionPackageManager;
  /**
   * True when the package manager was not detected and npm is the fallback.
   * The upgrade command still uses npm in that case.
   */
  packageManagerAssumed: boolean;
  global: boolean;
  upgradeCommand: string;
}

interface UnsupportedPackageManagerVersionContext extends VersionContextBase {
  manager: 'package-manager';
  canSwitchVersions: false;
  packageManager: undefined;
  packageManagerAssumed: false;
  global: undefined;
  upgradeCommand: undefined;
  upgradeError: Error;
}

export type PackageManagerVersionContext =
  | SupportedPackageManagerVersionContext
  | UnsupportedPackageManagerVersionContext;

/**
 * How this CLI process is installed and which version is active.
 *
 * Every `vc version` path should read from this object instead of
 * re-deriving installer vs package-manager vs native vs Node.js.
 */
export type VersionContext =
  | InstallerVersionContext
  | PackageManagerVersionContext;

export function isInstallerManaged(
  context: VersionContext
): context is InstallerVersionContext {
  return context.manager === 'installer';
}

export function isPackageManagerManaged(
  context: VersionContext
): context is PackageManagerVersionContext {
  return context.manager === 'package-manager';
}

/**
 * The command that installs a specific version with the detected (or assumed)
 * package manager, based on the same upgrade command `vc version` shows.
 */
export function getPackageManagerInstallCommand(
  context: PackageManagerVersionContext,
  version = 'latest'
): string {
  if (context.upgradeCommand === undefined) {
    throw context.upgradeError;
  }
  if (context.upgradeCommand.includes('@latest')) {
    return context.upgradeCommand.replace('@latest', `@${version}`);
  }
  return context.upgradeCommand;
}

interface VersionContextOptions {
  signal?: AbortSignal;
}

async function resolvePackageManagerContext(
  version: string,
  runtime: CliRuntime,
  options: VersionContextOptions
): Promise<PackageManagerVersionContext> {
  if (await isHomebrewInstall()) {
    return {
      version,
      runtime,
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: 'homebrew',
      packageManagerAssumed: false,
      global: true,
      upgradeCommand: HOMEBREW_UPGRADE_COMMAND,
    };
  }
  try {
    const info = await getUpdateCommandInfo(undefined, options.signal);
    return {
      version,
      runtime,
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: info.packageManager,
      packageManagerAssumed: info.assumed,
      global: info.global,
      upgradeCommand: info.command,
    };
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    const upgradeError =
      error instanceof Error
        ? error
        : new Error(
            'Could not detect a supported global npm, pnpm, Yarn, or Bun installation of Vercel CLI. Update it with the package manager that installed it.'
          );
    return {
      version,
      runtime,
      manager: 'package-manager',
      canSwitchVersions: false,
      packageManager: undefined,
      packageManagerAssumed: false,
      global: undefined,
      upgradeCommand: undefined,
      upgradeError,
    };
  }
}

export async function getVersionContext(
  options: VersionContextOptions = {}
): Promise<VersionContext> {
  const version = pkg.version;
  const runtime: CliRuntime = isNativeBinaryInstall() ? 'native' : 'node';

  if (await isCurlInstall()) {
    const installRoot = getInstallRoot();
    const state = await readNativeInstallState(installRoot);
    return {
      version,
      runtime: 'native',
      manager: 'installer',
      canSwitchVersions: true,
      installRoot,
      track: state?.track,
      slot: state?.slot,
      activeVersion: state?.version,
      pendingProduction: state?.pendingProduction,
      prBuild:
        state?.track === 'pr' && state.pr
          ? { number: state.pr, sha: state.buildSha }
          : undefined,
    };
  }

  return resolvePackageManagerContext(version, runtime, options);
}

export function describeRuntime(context: VersionContext): string {
  return context.runtime === 'native' ? 'native binary' : 'Node.js';
}

export function describeManager(context: VersionContext): string {
  if (context.manager === 'installer') {
    return `Vercel installer (${context.installRoot})`;
  }

  if (context.global === undefined) {
    return 'package manager (unsupported installation)';
  }
  if (context.packageManager === 'homebrew') {
    return 'Homebrew';
  }
  const scope = context.global ? 'global' : 'local';
  if (context.packageManagerAssumed) {
    return `package manager (assumed ${context.packageManager}, ${scope})`;
  }
  return `package manager (${context.packageManager}, ${scope})`;
}
