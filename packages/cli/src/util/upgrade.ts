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
async function executeStoreUpgrade(targetVersion?: string): Promise<number> {
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

  if (isVersionCurrent(versionBefore, resolvedTarget)) {
    renderUpgradeProgress(totalSteps, totalSteps);
    output.stopSpinner();
    output.log(
      `No upgrade available. Vercel CLI is already up to date (v${versionBefore}).`
    );
    return 0;
  }

  // Also a no-op when the store already holds the target, even though the
  // running version is older. Notably: prerelease builds (x.y.z-sha) sort
  // below the release x.y.z, so without this check a prerelease install
  // would re-report an available upgrade on every run despite the store
  // being current.
  const pointer = readPointer();
  if (pointer && isVersionCurrent(pointer.version, resolvedTarget)) {
    renderUpgradeProgress(totalSteps, totalSteps);
    output.stopSpinner();
    output.log(
      `No upgrade available. The managed CLI store is already up to date (v${pointer.version}).`
    );
    return 0;
  }

  renderUpgradeProgress(1, totalSteps, `Downloading v${resolvedTarget}…`);
  try {
    const installedVersion = await installVersionToStore(
      packageName,
      resolvedTarget
    );
    renderUpgradeProgress(totalSteps, totalSteps);
    output.stopSpinner();
    // Report the measured version, not the requested one.
    output.success(
      `Vercel CLI has been upgraded to v${installedVersion} successfully!`
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

export async function executeUpgrade(targetVersion?: string): Promise<number> {
  // The managed store path never invokes a package manager, so it does not
  // need to detect how the CLI was installed. Native binary installs are
  // excluded until the store supports native payloads.
  if (isCliStoreEnabled() && !isNativeBinaryInstall()) {
    return executeStoreUpgrade(targetVersion);
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
