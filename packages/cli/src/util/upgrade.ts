import { spawn, execFile } from 'child_process';
import { tmpdir } from 'os';
import semver from 'semver';
import { getUpdateCommandInfo } from './get-update-command';
import pkg from './pkg';
import output from '../output-manager';
import { progress } from './output/progress';
import { isNativeBinaryInstall } from './native-install';
import { fetchLatestVersion } from './get-latest-version';
import {
  isCliStoreEnabled,
  installVersionToStore,
  installNativeVersionToStore,
  readPointer,
} from './cli-store';
import { packageName } from './pkg-name';

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

function execFileStdout(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', windowsHide: true },
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

function parseVersionOutput(stdout: string): string | undefined {
  for (const line of stdout.trim().split('\n').reverse()) {
    try {
      const parsed = JSON.parse(line);
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
  packageManager: string,
  installArgs: string[]
): Promise<string | undefined> {
  const packageSpecifier = installArgs.find(arg => arg.endsWith('@latest'));
  if (!packageSpecifier) {
    return undefined;
  }

  const queryArgs =
    packageManager === 'yarn'
      ? ['info', packageSpecifier, 'version', '--json']
      : ['view', packageSpecifier, 'version', '--json'];

  try {
    const stdout = await execFileStdout(packageManager, queryArgs);
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

function isVersionCurrent(current: string, latest: string): boolean {
  return semver.valid(current) && semver.valid(latest)
    ? semver.gte(current, latest)
    : current === latest;
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
/**
 * Upgrades via the managed CLI store: downloads the target version's tarball
 * from the npm registry, verifies its integrity, extracts it into
 * ~/.vercel/cli/versions/<v>/, and atomically flips the store pointer. The
 * entrypoint redirects to the store when it holds a newer version, so this
 * upgrade takes effect for every install of the CLI on the machine without
 * touching any package manager.
 */
async function executeStoreUpgrade(
  targetVersion: string | undefined,
  payloadType: 'npm' | 'native'
): Promise<number> {
  const totalSteps = 3;
  const versionBefore = pkg.version;

  renderUpgradeProgress(0, totalSteps, 'Checking for updates…');
  const resolvedTarget =
    targetVersion ?? (await fetchLatestVersion({ name: packageName }));

  if (!resolvedTarget) {
    output.stopSpinner();
    output.error(
      'Could not determine the latest Vercel CLI version from the registry.'
    );
    return 1;
  }

  const pointer = readPointer();
  const switchingType = pointer !== undefined && pointer.type !== payloadType;

  const install = (version: string) =>
    payloadType === 'native'
      ? installNativeVersionToStore(version)
      : installVersionToStore(packageName, version);

  // No-op cases — unless the payload type is changing, in which case an
  // install of the same version with the new type is exactly the point.
  if (!switchingType) {
    if (isVersionCurrent(versionBefore, resolvedTarget)) {
      // Enrollment must produce a store even when no upgrade is needed:
      // seed it so the machine is managed from now on.
      if (!pointer) {
        renderUpgradeProgress(1, totalSteps, 'Initializing managed store…');
        try {
          await install(resolvedTarget);
        } catch (err) {
          output.stopSpinner();
          output.error(
            `Could not initialize the managed store: ${err instanceof Error ? err.message : String(err)}`
          );
          return 1;
        }
      }
      renderUpgradeProgress(totalSteps, totalSteps);
      output.stopSpinner();
      output.log(
        `No upgrade available. Vercel CLI is already up to date (v${versionBefore}).`
      );
      return 0;
    }

    // Also a no-op when the store already holds the target (prerelease
    // builds sort below the release, so the running-version check alone
    // would re-offer the same upgrade forever).
    if (pointer && isVersionCurrent(pointer.version, resolvedTarget)) {
      renderUpgradeProgress(totalSteps, totalSteps);
      output.stopSpinner();
      output.log(
        `No upgrade available. The managed CLI store is already up to date (v${pointer.version}).`
      );
      return 0;
    }
  }

  renderUpgradeProgress(
    1,
    totalSteps,
    `Downloading v${resolvedTarget}${payloadType === 'native' ? ' (native binary)' : ''}…`
  );
  try {
    const installedVersion = await install(resolvedTarget);
    renderUpgradeProgress(totalSteps, totalSteps);
    output.stopSpinner();
    // Report the measured version, not the requested one.
    output.success(
      payloadType === 'native'
        ? `Vercel CLI (native binary) v${installedVersion} is now active!`
        : `Vercel CLI has been upgraded to v${installedVersion} successfully!`
    );
    return 0;
  } catch (err) {
    output.stopSpinner();
    output.error(
      `Upgrade failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}

export interface ExecuteUpgradeOptions {
  experimental?: boolean;
  /** Switch the managed store to the native binary payload. */
  binary?: boolean;
  /** Switch the managed store back to the npm payload. */
  noBinary?: boolean;
}

export async function executeUpgrade(
  targetVersion?: string,
  opts: ExecuteUpgradeOptions = {}
): Promise<number> {
  // The managed store path never invokes a package manager, so it does not
  // need to detect how the CLI was installed. Active when the machine is
  // enrolled (store exists) or enrolling now (--experimental/--binary).
  // VERCEL_VC_NATIVE installs are excluded: the running native binary
  // manages itself through its own channel until it is store-aware.
  const storeActive =
    opts.experimental || opts.binary || opts.noBinary || isCliStoreEnabled();
  if (storeActive && !isNativeBinaryInstall()) {
    const pointer = readPointer();
    const payloadType: 'npm' | 'native' = opts.binary
      ? 'native'
      : opts.noBinary
        ? 'npm'
        : (pointer?.type ?? 'npm');
    return executeStoreUpgrade(targetVersion, payloadType);
  }

  const totalSteps = targetVersion ? 2 : 3;
  renderUpgradeProgress(0, totalSteps, 'Resolving installer…');

  const { command: updateCommand, global } = await getUpdateCommandInfo().catch(
    error => {
      output.stopSpinner();
      throw error;
    }
  );
  const [command, ...args] = updateCommand.split(' ');

  const cwd = global ? tmpdir() : process.cwd();

  // The version currently running, captured before the install overwrites it.
  // This is what `vc --version` reports, for both Node.js and native binary.
  const versionBefore = pkg.version;

  let resolvedTargetVersion = targetVersion;
  if (!resolvedTargetVersion) {
    renderUpgradeProgress(1, totalSteps, 'Checking for updates…');
    resolvedTargetVersion = await getLatestPackageVersion(command, args);
  }

  if (
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

  output.debug(`Executing: ${updateCommand} (cwd: ${cwd})`);
  renderUpgradeProgress(targetVersion ? 1 : 2, totalSteps, 'Installing…');

  return new Promise<number>(resolve => {
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];

    const upgradeProcess = spawn(command, args, {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
    });

    upgradeProcess.stdout?.on('data', (data: Buffer) => {
      stdout.push(Uint8Array.from(data));
    });

    upgradeProcess.stderr?.on('data', (data: Buffer) => {
      stderr.push(Uint8Array.from(data));
    });

    upgradeProcess.on('error', (err: Error) => {
      output.stopSpinner();
      output.error(`Failed to execute upgrade command: ${err.message}`);
      output.log(`You can try running the command manually: ${updateCommand}`);
      resolve(1);
    });

    upgradeProcess.on('close', (code: number | null) => {
      if (code !== 0) {
        output.stopSpinner();
        // Show output only on error
        const stdoutStr = Buffer.concat(stdout).toString();
        const stderrStr = Buffer.concat(stderr).toString();
        if (stdoutStr) {
          output.print(stdoutStr);
        }
        if (stderrStr) {
          output.print(stderrStr);
        }
        output.error(`Upgrade failed with exit code ${code ?? 'unknown'}`);
        output.log(
          `You can try running the command manually: ${updateCommand}`
        );
        resolve(code ?? 1);
        return;
      }

      renderUpgradeProgress(totalSteps, totalSteps);
      output.stopSpinner();

      if (resolvedTargetVersion) {
        output.success(
          `Vercel CLI has been upgraded to v${resolvedTargetVersion} successfully!`
        );
        resolve(0);
        return;
      }

      output.success('Vercel CLI has been upgraded successfully!');
      resolve(0);
    });
  });
}
