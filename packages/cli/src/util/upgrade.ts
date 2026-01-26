import { spawn } from 'child_process';
import getUpdateCommand from './get-update-command';
import output from '../output-manager';

/**
 * Executes the upgrade command to update the Vercel CLI.
 * Returns the exit code from the upgrade process.
 */
export async function executeUpgrade(): Promise<number> {
  const updateCommand = await getUpdateCommand();
  const [command, ...args] = updateCommand.split(' ');

  output.log(`Upgrading Vercel CLI...`);
  output.debug(`Executing: ${updateCommand}`);

  return new Promise<number>(resolve => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const upgradeProcess = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
    });

    upgradeProcess.stdout?.on('data', (data: Buffer) => {
      stdout.push(data);
    });

    upgradeProcess.stderr?.on('data', (data: Buffer) => {
      stderr.push(data);
    });

    upgradeProcess.on('error', (err: Error) => {
      output.error(`Failed to execute upgrade command: ${err.message}`);
      output.log(`You can try running the command manually: ${updateCommand}`);
      resolve(1);
    });

    upgradeProcess.on('close', (code: number | null) => {
      if (code === 0) {
        output.success('Vercel CLI has been upgraded successfully!');
      } else {
        // Show output only on error
        const stdoutStr = Buffer.concat(stdout).toString();
        const stderrStr = Buffer.concat(stderr).toString();
        if (stdoutStr) {
          output.print(stdoutStr);
        }
        if (stderrStr) {
          output.print(stderrStr);
        }
        output.error(`Upgrade failed with exit code ${code ?? 1}`);
        output.log(
          `You can try running the command manually: ${updateCommand}`
        );
      }
      resolve(code ?? 1);
    });
  });
}
