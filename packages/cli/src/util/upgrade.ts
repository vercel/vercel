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

function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Executes the upgrade command to update the Vercel CLI.
 * Returns the exit code from the upgrade process.
 *
 * @param targetVersion The version being upgraded to, when the caller already
 * knows it (the update notifier). When omitted (e.g. `vercel upgrade`), the
 * latest version is resolved before the install so no-op upgrades can be
 * reported without relying on whichever binary happens to be on `PATH`.
 * @param options.interactive Allow the package manager to interact with the
 * user's terminal. pnpm v10+ prompts to approve dependency build scripts
 * (e.g. esbuild's postinstall), which requires the install to run with the
 * user's stdio attached. Only takes effect when the package manager may
 * prompt (pnpm) and the process is attached to a TTY. Callers running
 * unattended (e.g. automatic updates) should leave this off.
 */
export async function executeUpgrade(
  targetVersion?: string,
  options: { interactive?: boolean } = {}
): Promise<number> {
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

  // npm and yarn never prompt during install, so only pnpm needs the
  // interactive treatment. Interactivity also requires a TTY — without one,
  // pnpm skips its prompts and proceeds non-interactively.
  const mayPrompt = command === 'pnpm';
  const interactive =
    Boolean(options.interactive) && mayPrompt && isInteractiveTerminal();

  output.debug(`Executing: ${updateCommand} (cwd: ${cwd})`);

  if (interactive) {
    // Hand the installer the terminal so the user can see and answer pnpm's
    // build-script approval prompt (e.g. esbuild's postinstall).
    output.stopSpinner();
    output.log(`Running ${updateCommand}`);
  } else {
    renderUpgradeProgress(targetVersion ? 1 : 2, totalSteps, 'Installing…');
  }

  // When pnpm runs non-interactively, detach stdin so it cannot wait on a
  // hidden prompt (its output is captured, so the user would never see it).
  const stdio: ('inherit' | 'ignore' | 'pipe')[] | 'inherit' = interactive
    ? 'inherit'
    : [mayPrompt ? 'ignore' : 'inherit', 'pipe', 'pipe'];

  return new Promise<number>(resolve => {
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];

    const upgradeProcess = spawn(command, args, {
      cwd,
      stdio,
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
        // Show captured output only on error (interactive installs already
        // streamed their output directly to the terminal)
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

      if (!interactive) {
        renderUpgradeProgress(totalSteps, totalSteps);
        output.stopSpinner();
      }

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
