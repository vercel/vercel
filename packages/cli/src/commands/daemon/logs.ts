import { spawn } from 'child_process';
import { join } from 'path';
import { homedir, platform } from 'os';
import { existsSync, readFileSync } from 'fs';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { daemonCommand } from './command';

function getUserDataDir(): string | null {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  switch (platform()) {
    case 'darwin':
      return join(homedir(), 'Library/Application Support');
    case 'linux':
      return join(homedir(), '.local/share');
    case 'win32':
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      return null;
    default:
      return null;
  }
}

function getLogPath(): string | null {
  const dataDir = getUserDataDir();
  if (!dataDir) {
    return null;
  }
  return join(dataDir, 'com.vercel.cli', 'logs', 'daemon.log');
}

export default async function logs(
  client: Client,
  args: string[]
): Promise<number> {
  const logsSubcommand = daemonCommand.subcommands!.find(
    sub => sub.name === 'logs'
  )!;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(logsSubcommand.options);

  try {
    parsedArgs = parseArguments(args, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const follow = parsedArgs.flags['--follow'] === true;
  const lines = parseInt(String(parsedArgs.flags['--lines'] || '50'), 10);

  const logPath = getLogPath();
  if (!logPath) {
    output.error('Unable to determine log file path');
    return 1;
  }

  if (!existsSync(logPath)) {
    output.error(
      'Log file does not exist. Daemon may not have been started yet.'
    );
    return 1;
  }

  if (follow) {
    // Use tail -f for following logs
    const tail = spawn('tail', ['-f', '-n', String(lines), logPath], {
      stdio: 'inherit',
    });

    // Wait for tail process (will run until interrupted)
    await new Promise<void>((resolve, reject) => {
      tail.on('exit', code => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`tail exited with code ${code}`));
        }
      });
      tail.on('error', reject);

      // Handle SIGINT to stop tail
      process.on('SIGINT', () => {
        tail.kill('SIGTERM');
        resolve();
      });
    });

    return 0;
  } else {
    // Read last N lines
    try {
      const content = readFileSync(logPath, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());
      const lastLines = allLines.slice(-lines);

      for (const line of lastLines) {
        output.print(line);
      }

      return 0;
    } catch (err) {
      output.error(
        `Failed to read log file: ${err instanceof Error ? err.message : String(err)}`
      );
      return 1;
    }
  }
}
