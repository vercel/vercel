import { spawn } from 'child_process';
import { join } from 'path';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { isDaemonRunning } from '../../util/daemon/ipc-client';
import { daemonCommand } from './command';

export default async function start(
  client: Client,
  args: string[]
): Promise<number> {
  const startSubcommand = daemonCommand.subcommands!.find(
    sub => sub.name === 'start'
  )!;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(startSubcommand.options);

  try {
    parsedArgs = parseArguments(args, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const foreground = parsedArgs.flags['--foreground'] === true;

  // Check if daemon is already running
  try {
    const isRunning = await isDaemonRunning();
    if (isRunning) {
      output.error('Daemon is already running');
      return 1;
    }
  } catch (err) {
    // Daemon is not running, continue
  }

  // Find daemon executable
  // The daemon bundle is copied to the same directory as the CLI during build
  const daemonPath = join(__dirname, 'vercel-daemon.js');

  output.log('Starting daemon...');

  try {
    if (foreground) {
      // Run in foreground for debugging
      const child = spawn(process.execPath, [daemonPath], {
        stdio: 'inherit',
      });

      // Wait for process to exit
      await new Promise<void>((resolve, reject) => {
        child.on('exit', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Daemon exited with code ${code}`));
          }
        });
        child.on('error', reject);
      });

      return 0;
    } else {
      // Run in background (detached)
      const child = spawn(process.execPath, [daemonPath], {
        detached: true,
        stdio: 'ignore',
      });

      // Unref to allow parent to exit
      child.unref();

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify it's running
      const isRunning = await isDaemonRunning();
      if (isRunning) {
        output.log('Daemon started successfully');
        return 0;
      } else {
        output.error('Failed to start daemon. Check logs for details.');
        return 1;
      }
    }
  } catch (err) {
    output.error(
      `Failed to start daemon: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
