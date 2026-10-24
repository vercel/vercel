import { spawn, execFile } from 'child_process';
import { tmpdir } from 'os';
import semver from 'semver';
import { getUpdateCommandInfo } from './get-update-command';
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

interface InstallerResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

function runInstaller(
  command: string,
  args: string[],
  cwd: string
): Promise<InstallerResult> {
  return new Promise<InstallerResult>(resolve => {
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

    const collect = () => ({
      stdout: Buffer.concat(stdout).toString(),
      stderr: Buffer.concat(stderr).toString(),
    });

    upgradeProcess.on('error', (error: Error) => {
      resolve({ code: null, error, ...collect() });
    });

    upgradeProcess.on('close', (code: number | null) => {
      resolve({ code, ...collect() });
    });
  });
}

const ALLOW_BUILD_FLAG = '--allow-build=';

/**
 * pnpm 12+ refuses `--allow-build=<pkg>` when the global config already sets
 * `allowBuilds: { <pkg>: false }` (often left behind by an earlier
 * approve-builds prompt). The user's explicit choice wins: drop the flag.
 */
function isPnpmAllowBuildConflict(
  command: string,
  args: string[],
  result: InstallerResult
): boolean {
  return (
    command === 'pnpm' &&
    args.some(arg => arg.startsWith(ALLOW_BUILD_FLAG)) &&
    `${result.stdout}\n${result.stderr}`.includes(
      'ERR_PNPM_OVERRIDING_IGNORED_BUILT_DEPENDENCIES'
    )
  );
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

  let result = await runInstaller(command, args, cwd);
  let manualCommand = updateCommand;

  if (
    result.code !== 0 &&
    !result.error &&
    isPnpmAllowBuildConflict(command, args, result)
  ) {
    const retryArgs = args.filter(arg => !arg.startsWith(ALLOW_BUILD_FLAG));
    manualCommand = [command, ...retryArgs].join(' ');
    output.debug(
      `pnpm config denies a build that --allow-build pre-approves; retrying: ${manualCommand}`
    );
    result = await runInstaller(command, retryArgs, cwd);
  }

  if (result.error) {
    output.stopSpinner();
    output.error(`Failed to execute upgrade command: ${result.error.message}`);
    output.log(`You can try running the command manually: ${manualCommand}`);
    return 1;
  }

  if (result.code !== 0) {
    output.stopSpinner();
    // Show output only on error
    if (result.stdout) {
      output.print(result.stdout);
    }
    if (result.stderr) {
      output.print(result.stderr);
    }
    output.error(`Upgrade failed with exit code ${result.code ?? 'unknown'}`);
    output.log(`You can try running the command manually: ${manualCommand}`);
    return result.code ?? 1;
  }

  renderUpgradeProgress(totalSteps, totalSteps);
  output.stopSpinner();

  if (resolvedTargetVersion) {
    output.success(
      `Vercel CLI has been upgraded to v${resolvedTargetVersion} successfully!`
    );
    return 0;
  }

  output.success('Vercel CLI has been upgraded successfully!');
  return 0;
}
