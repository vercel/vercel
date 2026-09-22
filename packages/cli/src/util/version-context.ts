import pkg from './pkg';
import { packageName } from './pkg-name';
import { getInstallRoot, isNativeBinaryInstall } from './native-install';
import {
  CURL_INSTALL_COMMAND,
  getLinkedVersion,
  getPinnedVersion,
  getPrBuildSha,
  isCurlInstall,
} from './native-self-update';
import {
  getUpdateCommandInfo,
  type PackageManagerName,
} from './get-update-command';

export { CURL_INSTALL_COMMAND };
export type { PackageManagerName };

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
  linkedVersion: string | undefined;
  pinnedVersion: string | undefined;
  prBuild:
    | {
        name: string;
        number: number;
        sha: string | undefined;
      }
    | undefined;
}

export interface PackageManagerVersionContext extends VersionContextBase {
  manager: 'package-manager';
  canSwitchVersions: false;
  packageManager: PackageManagerName;
  /**
   * True when the package manager was not detected and npm is the fallback.
   * The upgrade command still uses npm in that case.
   */
  packageManagerAssumed: boolean;
  global: boolean;
  upgradeCommand: string;
}

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
  if (context.upgradeCommand.includes('@latest')) {
    return context.upgradeCommand.replace('@latest', `@${version}`);
  }
  return context.upgradeCommand;
}

async function resolvePrBuild(
  linkedVersion: string | undefined
): Promise<InstallerVersionContext['prBuild']> {
  if (!linkedVersion?.startsWith('pr-')) {
    return undefined;
  }
  const number = Number(linkedVersion.slice(3));
  if (!Number.isSafeInteger(number) || number <= 0) {
    return undefined;
  }
  return {
    name: linkedVersion,
    number,
    sha: await getPrBuildSha(linkedVersion),
  };
}

function assumedNpmContext(
  version: string,
  runtime: CliRuntime
): PackageManagerVersionContext {
  return {
    version,
    runtime,
    manager: 'package-manager',
    canSwitchVersions: false,
    packageManager: 'npm',
    packageManagerAssumed: true,
    global: true,
    upgradeCommand: `npm i -g ${packageName}@latest`,
  };
}

async function resolvePackageManagerContext(
  version: string,
  runtime: CliRuntime
): Promise<PackageManagerVersionContext> {
  try {
    const info = await getUpdateCommandInfo();
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
  } catch {
    return assumedNpmContext(version, runtime);
  }
}

export async function getVersionContext(): Promise<VersionContext> {
  const version = pkg.version;
  const runtime: CliRuntime = isNativeBinaryInstall() ? 'native' : 'node';

  if (await isCurlInstall()) {
    const [linkedVersion, pinnedVersion] = await Promise.all([
      getLinkedVersion(),
      getPinnedVersion(),
    ]);
    return {
      version,
      runtime: 'native',
      manager: 'installer',
      canSwitchVersions: true,
      installRoot: getInstallRoot(),
      linkedVersion,
      pinnedVersion,
      prBuild: await resolvePrBuild(linkedVersion),
    };
  }

  return resolvePackageManagerContext(version, runtime);
}

export function describeRuntime(context: VersionContext): string {
  return context.runtime === 'native' ? 'native binary' : 'Node.js';
}

export function describeManager(context: VersionContext): string {
  if (context.manager === 'installer') {
    return `Vercel installer (${context.installRoot})`;
  }

  const scope = context.global ? 'global' : 'local';
  if (context.packageManagerAssumed) {
    return `package manager (assumed ${context.packageManager}, ${scope})`;
  }
  return `package manager (${context.packageManager}, ${scope})`;
}
