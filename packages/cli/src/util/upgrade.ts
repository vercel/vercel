import { spawn, execFile } from 'child_process';
import { tmpdir } from 'os';
import semver from 'semver';
import { getUpdateCommandInfo } from './get-update-command';
import { isNativeBinaryInstall } from './native-install';
import { getInstalledVersion } from './upgrade-version';
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
export async function executeUpgrade(targetVersion?: string): Promise<number> {
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

    // Stream to debug so --debug reveals an otherwise-invisible installer
    // prompt (the cause of apparent hangs).
    upgradeProcess.stdout?.on('data', (data: Buffer) => {
      stdout.push(Uint8Array.from(data));
      output.debug(`[upgrade stdout] ${data.toString().trimEnd()}`);
    });

    upgradeProcess.stderr?.on('data', (data: Buffer) => {
      stderr.push(Uint8Array.from(data));
      output.debug(`[upgrade stderr] ${data.toString().trimEnd()}`);
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

      // The installer may exit 0 yet not update the running CLI (e.g. a second
      // global install shadows the updated one). Re-read the on-disk version to
      // report what actually got installed. Native binaries embed package.json
      // in a VFS snapshot, so skip the check there and trust the exit code.
      const nativeInstall = isNativeBinaryInstall();
      const installedVersion = nativeInstall
        ? undefined
        : getInstalledVersion();

      if (
        installedVersion &&
        semver.valid(installedVersion) &&
        semver.valid(versionBefore) &&
        semver.neq(installedVersion, versionBefore)
      ) {
        output.success(
          `Vercel CLI has been upgraded to v${installedVersion} successfully!`
        );
        resolve(0);
        return;
      }

      // The on-disk version is unchanged — the upgrade didn't reach the
      // active CLI. Surface this honestly instead of claiming success.
      if (installedVersion && !nativeInstall) {
        output.warn(
          `The upgrade completed, but the active Vercel CLI is still v${versionBefore}. ` +
            `Another install may be shadowing the updated one on your PATH.`
        );
        output.log(
          `Verify with \`vc --version\`, or reinstall with: ${updateCommand}`
        );
        resolve(0);
        return;
      }

      // Native install, or the on-disk version was unreadable.
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
