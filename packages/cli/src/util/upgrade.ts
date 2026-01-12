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
    const upgradeProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
    });

    upgradeProcess.on('error', (err: Error) => {
      output.error(`Failed to execute upgrade command: ${err.message}`);
      output.log(`You can try running the command manually: ${updateCommand}`);
      resolve(1);
    });

    upgradeProcess.on('close', (code: number | null) => {
      if (code === 0) {
        output.success('Vercel CLI has been upgraded successfully!');
      }
      resolve(code ?? 1);
    });
  });
}
