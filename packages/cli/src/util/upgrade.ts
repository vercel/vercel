import { spawn, execFile } from 'child_process';
import semver from 'semver';
import {
  getUpdateCommandInfo,
  HOMEBREW_UPGRADE_COMMAND,
} from './get-update-command';
import type { PackageManagerName } from './get-update-command';
import { getUpgradePackageManager } from './upgrade-package-managers';
import {
  trustedUpgradeDirectory,
  trustedUpgradeEnvironment,
} from './upgrade-environment';
import type Client from './client';
import pkg from './pkg';
import output from '../output-manager';
import { progress } from './output/progress';

function renderUpgradeProgress(
  current: number,
  total: number,
  phase?: string
): void {
  const bar = progress(current, total);
  output.spinner(
    bar
      ? `Upgrading Vercel CLI [${bar}] (${current}/${total})${phase ? ` ${phase}` : ''}`
      : phase || 'Upgrading Vercel CLI…',
    0
  );
}

function execFileStdout(
  command: string,
  args: string[],
  cwd?: string,
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: 'utf8',
        windowsHide: true,
        cwd,
        timeout: 15000,
        env: { ...env },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.toString());
      }
    );
  });
}

export function parseVersionOutput(stdout: string): string | undefined {
  // npm 12 returns a (potentially multiline) single-element JSON array.
  // Parse the complete document before trying Yarn's newline-delimited output.
  for (const line of [stdout.trim(), ...stdout.trim().split('\n').reverse()]) {
    try {
      const value = JSON.parse(line);
      const parsed =
        Array.isArray(value) && value.length === 1 ? value[0] : value;
      const version =
        typeof parsed === 'string'
          ? parsed
          : typeof parsed?.data === 'string'
            ? parsed.data
            : undefined;
      if (version && semver.valid(version)) {
        return version;
      }
    } catch {
      const version = line.trim();
      if (semver.valid(version)) {
        return version;
      }
    }
  }

  return undefined;
}

async function getLatestPackageVersion(
  packageManager: PackageManagerName,
  installArgs: string[],
  cwd: string,
  global: boolean,
  env: NodeJS.ProcessEnv,
  bypassMinReleaseAge = true
): Promise<string | undefined> {
  const packageSpecifier = installArgs.find(arg => arg.endsWith('@latest'));
  if (!packageSpecifier) {
    return undefined;
  }

  const manager = getUpgradePackageManager(packageManager);
  const queryArgs = [
    ...manager.metadataArgs(packageSpecifier),
    ...(bypassMinReleaseAge ? manager.releaseAgeBypassArgs : []),
  ];

  try {
    const stdout = await execFileStdout(packageManager, queryArgs, cwd, env);
    return parseVersionOutput(stdout);
  } catch (error) {
    output.debug(
      `Failed to resolve the latest Vercel CLI version: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

async function getInstalledPackageVersion(
  packageManager: PackageManagerName,
  installArgs: string[],
  cwd: string,
  global: boolean
): Promise<string | undefined> {
  const packageSpecifier = installArgs.find(arg => arg.endsWith('@latest'));
  if (!packageSpecifier) return undefined;
  const packageName = packageSpecifier.slice(0, -'@latest'.length);

  try {
    const stdout = await execFileStdout(
      packageManager,
      [
        'list',
        packageName,
        '--depth=0',
        '--json',
        ...(global ? ['--global'] : []),
      ],
      cwd
    );
    const parsed = JSON.parse(stdout);
    // npm returns an object; pnpm returns an array of projects.
    const projects = Array.isArray(parsed) ? parsed : [parsed];
    for (const project of projects) {
      const version =
        project?.dependencies?.[packageName]?.version ??
        project?.devDependencies?.[packageName]?.version ??
        project?.optionalDependencies?.[packageName]?.version;
      if (typeof version === 'string' && semver.valid(version)) return version;
    }
  } catch (error) {
    output.debug(
      `Failed to read the installed Vercel CLI version: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return undefined;
}

function isVersionCurrent(current: string, latest: string): boolean {
  return semver.valid(current) && semver.valid(latest)
    ? semver.gte(current, latest)
    : current === latest;
}

export function pinPackageVersion(args: string[], version: string): string[] {
  return args.map(arg =>
    arg.endsWith('@latest')
      ? `${arg.slice(0, -'latest'.length)}${version}`
      : arg
  );
}

async function getMinReleaseAgeContext(
  packageManager: PackageManagerName,
  cwd: string,
  global: boolean
): Promise<string> {
  const setting =
    packageManager === 'pnpm' ? 'minimumReleaseAge' : 'min-release-age';
  try {
    const raw = (
      await execFileStdout(
        packageManager,
        ['config', 'get', setting, '--json', ...(global ? ['--global'] : [])],
        cwd
      )
    ).trim();
    const value: unknown =
      raw === '' || raw === 'undefined' ? undefined : JSON.parse(raw);
    const missing = value == null || value === '' || value === 'undefined';
    if (!missing) {
      const age =
        typeof value === 'number' ||
        (typeof value === 'string' && value.trim() !== '')
          ? Number(value)
          : NaN;
      if (!Number.isFinite(age) || age < 0) {
        return `Could not determine ${packageManager}'s configured minimum release age.`;
      }
      const minutes = packageManager === 'pnpm' ? age : age * 1440;
      const duration =
        minutes > 0 && minutes % 60 === 0
          ? `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
          : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
      return `${packageManager} ${setting} is configured to ${duration}.`;
    }
    if (packageManager === 'pnpm') {
      const version = parseVersionOutput(
        await execFileStdout(packageManager, ['--version'], cwd)
      );
      // pnpm v11.0.0 introduced the 1440-minute default:
      // https://github.com/pnpm/pnpm/releases/tag/v11.0.0
      if (
        version &&
        !semver.prerelease(version) &&
        semver.gte(version, '11.0.0')
      ) {
        return `pnpm ${version} defaults to a minimum release age of 24 hours (1440 minutes); no explicit minimumReleaseAge setting was reported.`;
      }
    }
    return `${packageManager} did not report a configured minimum release age.`;
  } catch {
    return `Could not determine ${packageManager}'s configured minimum release age.`;
  }
}

function isMinReleaseAgeError(
  packageManager: PackageManagerName,
  stdout: string,
  stderr: string
): boolean {
  const installerOutput = `${stdout}\n${stderr}`;

  if (packageManager === 'pnpm') {
    return (
      installerOutput.includes('ERR_PNPM_NO_MATURE_MATCHING_VERSION') ||
      (installerOutput.includes('ERR_PNPM_NO_MATCHING_VERSION') &&
        installerOutput.includes('satisfies the specs but was released at'))
    );
  }

  if (packageManager === 'npm') {
    return (
      (/\bETARGET\b/.test(installerOutput) &&
        installerOutput.includes('with a date before')) ||
      /min-release-age cannot be provided/i.test(installerOutput)
    );
  }

  return false;
}

export function setMinReleaseAgeBypass(client: Client, enabled: boolean): void {
  client.config = {
    ...client.config,
    updates: {
      ...client.config.updates,
      bypassMinReleaseAge: enabled,
    },
  };
  client.writeToConfigFile();
}

/**
 * Upgrades a Homebrew cask install by running `brew upgrade vercel`, letting
 * Homebrew own the files and report its own progress.
 */
export async function executeHomebrewUpgrade(
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment
): Promise<number> {
  const [brew, ...args] = HOMEBREW_UPGRADE_COMMAND.split(' ');
  output.debug(`Executing: ${HOMEBREW_UPGRADE_COMMAND}`);

  const result = await new Promise<{ code: number; spawnError?: Error }>(
    resolve => {
      let settled = false;
      const brewProcess = spawn(brew, args, {
        cwd: trustedUpgradeDirectory,
        env: { ...env },
        stdio: 'inherit',
        shell: false,
      });
      brewProcess.on('error', (spawnError: Error) => {
        if (settled) return;
        settled = true;
        resolve({ code: 1, spawnError });
      });
      brewProcess.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        resolve({ code: code ?? 1 });
      });
    }
  );

  if (result.spawnError) {
    output.error(`Failed to run Homebrew: ${result.spawnError.message}`);
    output.log(
      `You can try running the command manually: ${HOMEBREW_UPGRADE_COMMAND}`
    );
    return 1;
  }
  if (result.code !== 0) {
    output.error(`Homebrew upgrade failed with exit code ${result.code}`);
    output.log(
      `You can try running the command manually: ${HOMEBREW_UPGRADE_COMMAND}`
    );
  }
  return result.code;
}

type ReleaseAgePolicy = 'newest' | 'package-manager';

/**
 * Runs an automatic upgrade without overriding the package manager's release-age
 * policy or prompting the user. A persisted foreground-upgrade bypass does not
 * apply to automatic upgrades.
 */
export function executeAutomaticUpgrade(
  client: Client,
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment
): Promise<number> {
  return executeUpgrade('latest', client, false, true, env, 'package-manager');
}

/**
 * Executes the upgrade command to update the Vercel CLI.
 * Returns the exit code from the upgrade process.
 *
 * @param targetVersion The version being upgraded to, when the caller already
 * knows it (the update notifier). When omitted (e.g. `vercel upgrade`), the
 * latest version is resolved before the install so no-op upgrades can be
 * reported without relying on whichever binary happens to be on `PATH`.
 */
export async function executeUpgrade(
  targetVersion?: string,
  client?: Client,
  bypassMinReleaseAge = false,
  explicitTarget = false,
  env: NodeJS.ProcessEnv = trustedUpgradeEnvironment,
  releaseAgePolicy: ReleaseAgePolicy = 'newest'
): Promise<number> {
  const totalSteps = targetVersion ? 2 : 3;
  renderUpgradeProgress(0, totalSteps, 'Resolving installer…');

  const {
    command: updateCommand,
    global,
    packageManager,
  } = await getUpdateCommandInfo(env).catch(error => {
    output.stopSpinner();
    throw error;
  });
  const [command, ...args] = updateCommand.split(' ');

  const cwd = global ? trustedUpgradeDirectory : process.cwd();
  const bypassArgs =
    getUpgradePackageManager(packageManager).releaseAgeBypassArgs;
  if (bypassMinReleaseAge && bypassArgs.length === 0) {
    output.stopSpinner();
    output.error(
      `Minimum release-age bypass is not supported for ${packageManager}. Run the upgrade without --bypass-min-release-age, or configure release-age settings in ${packageManager} directly.`
    );
    return 1;
  }
  // Explicit consent applies to future foreground upgrades even if no install
  // is needed (or the registry lookup fails). Preview modes never enter this function.
  if (
    bypassMinReleaseAge &&
    client &&
    client.config.updates?.bypassMinReleaseAge !== true
  ) {
    setMinReleaseAgeBypass(client, true);
  }

  // The version currently running, captured before the install overwrites it.
  // This is what `vc --version` reports, for both Node.js and native binary.
  const versionBefore = pkg.version;

  const installLatestTag = explicitTarget && targetVersion === 'latest';
  let resolvedTargetVersion = installLatestTag ? undefined : targetVersion;
  if (!targetVersion) {
    renderUpgradeProgress(1, totalSteps, 'Checking for updates…');
    resolvedTargetVersion = await getLatestPackageVersion(
      packageManager,
      args,
      cwd,
      global,
      env,
      releaseAgePolicy === 'newest'
    );
  }

  if (!resolvedTargetVersion && !installLatestTag) {
    output.stopSpinner();
    output.error('Failed to resolve the latest Vercel CLI version.');
    return 1;
  }

  if (
    !explicitTarget &&
    resolvedTargetVersion &&
    isVersionCurrent(versionBefore, resolvedTargetVersion)
  ) {
    renderUpgradeProgress(totalSteps, totalSteps);
    output.stopSpinner();
    output.log(
      `No upgrade available. Vercel CLI is already up to date (v${versionBefore}).`
    );
    return 0;
  }

  let installArgs = resolvedTargetVersion
    ? pinPackageVersion(args, resolvedTargetVersion)
    : args;
  const shouldBypass =
    releaseAgePolicy === 'newest' &&
    bypassArgs.length > 0 &&
    (bypassMinReleaseAge ||
      client?.config.updates?.bypassMinReleaseAge === true);
  if (shouldBypass) {
    installArgs = [...installArgs, ...bypassArgs];
  }

  const runInstall = (
    currentArgs: string[]
  ): Promise<{
    code: number;
    stdout: string;
    stderr: string;
    spawnError?: Error;
  }> => {
    const installCommand = [command, ...currentArgs].join(' ');
    output.debug(`Executing: ${installCommand} (cwd: ${cwd})`);

    return new Promise(resolve => {
      const stdout: Uint8Array[] = [];
      const stderr: Uint8Array[] = [];
      const upgradeProcess = spawn(command, currentArgs, {
        cwd,
        env: { ...env },
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false,
      });

      upgradeProcess.stdout?.on('data', (data: Buffer) => {
        stdout.push(Uint8Array.from(data));
        output.debug(`[upgrade stdout] ${data.toString().trimEnd()}`);
      });
      upgradeProcess.stderr?.on('data', (data: Buffer) => {
        stderr.push(Uint8Array.from(data));
        output.debug(`[upgrade stderr] ${data.toString().trimEnd()}`);
      });
      let settled = false;
      upgradeProcess.on('error', (spawnError: Error) => {
        if (settled) return;
        settled = true;
        resolve({ code: 1, stdout: '', stderr: '', spawnError });
      });
      upgradeProcess.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        resolve({
          code: code ?? 1,
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        });
      });
    });
  };

  renderUpgradeProgress(targetVersion ? 1 : 2, totalSteps, 'Installing…');
  let result = await runInstall(installArgs);
  let usedAllowedRelease = false;

  if (
    result.code !== 0 &&
    !result.spawnError &&
    releaseAgePolicy === 'newest' &&
    !shouldBypass &&
    bypassArgs.length > 0 &&
    isMinReleaseAgeError(packageManager, result.stdout, result.stderr)
  ) {
    const context = await getMinReleaseAgeContext(packageManager, cwd, global);
    output.stopSpinner();
    const blockedMessage = `The package manager blocked this Vercel CLI release because of its minimum release-age setting. ${context}`;
    if (!client || client.nonInteractive || !client.stdin.isTTY) {
      output.error(
        `${blockedMessage}\nTo install the newest release allowed by your settings:\n  vc upgrade latest\nTo bypass the minimum release age for this and future foreground upgrades:\n  vc upgrade --bypass-min-release-age`
      );
      return 1;
    }

    output.print(`! ${blockedMessage}\n`);
    const action = await client.input.select({
      message: 'Which upgrade option?',
      choices: [
        {
          name: 'Install the newest release allowed by my settings',
          value: 'allowed',
        },
        {
          name: 'Bypass the minimum release age for this and future foreground upgrades',
          value: 'bypass',
        },
        { name: 'Cancel', value: 'cancel' },
      ],
      default: 'allowed',
    });
    if (action === 'allowed') {
      // Let the installer resolve the tag under its own release-age policy.
      // Never report the blocked, pinned version as the installed version.
      resolvedTargetVersion = undefined;
      installArgs = args;
      usedAllowedRelease = true;
    } else if (action === 'bypass') {
      setMinReleaseAgeBypass(client, true);
      output.log(
        'To restore release-age checks, run `vc upgrade --no-bypass-min-release-age`.'
      );
      installArgs = [...installArgs, ...bypassArgs];
    } else {
      output.log('Upgrade canceled.');
      return 0;
    }

    renderUpgradeProgress(targetVersion ? 1 : 2, totalSteps, 'Installing…');
    result = await runInstall(installArgs);
  }

  if (result.spawnError) {
    output.stopSpinner();
    output.error(
      `Failed to execute upgrade command: ${result.spawnError.message}`
    );
    output.log(
      `You can try running the command manually: ${[command, ...installArgs].join(' ')}`
    );
    return 1;
  }

  if (result.code !== 0) {
    output.stopSpinner();
    if (result.stdout) output.print(result.stdout);
    if (result.stderr) output.print(result.stderr);
    output.error(`Upgrade failed with exit code ${result.code}`);
    output.log(
      `You can try running the command manually: ${[command, ...installArgs].join(' ')}`
    );
    return result.code;
  }

  if (usedAllowedRelease) {
    resolvedTargetVersion = await getInstalledPackageVersion(
      packageManager,
      args,
      cwd,
      global
    );
    if (resolvedTargetVersion === versionBefore) {
      output.stopSpinner();
      output.log(
        `Vercel CLI remains at v${versionBefore} under your package manager settings.`
      );
      return 0;
    }
  }

  renderUpgradeProgress(totalSteps, totalSteps);
  output.stopSpinner();
  output.success(
    resolvedTargetVersion
      ? `Upgraded Vercel CLI to v${resolvedTargetVersion}.`
      : 'Upgraded Vercel CLI.'
  );
  return 0;
}
