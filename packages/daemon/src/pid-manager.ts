import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { homedir, platform } from 'os';
import { logger } from './logger';

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

export class PIDManager {
  private pidFile: string;

  constructor() {
    const dataDir = getUserDataDir();
    if (!dataDir) {
      throw new Error('Unable to determine user data directory');
    }

    this.pidFile = join(dataDir, 'com.vercel.cli', 'daemon.pid');
  }

  /**
   * Attempt to acquire the PID file for this process.
   * Returns true if successful, false if another daemon is already running.
   * Pattern based on get-latest-worker.js lines 114-119
   */
  async acquire(): Promise<boolean> {
    try {
      // Check if PID file exists
      if (existsSync(this.pidFile)) {
        const pidStr = readFileSync(this.pidFile, 'utf8');
        const pid = parseInt(pidStr, 10);

        if (!isNaN(pid)) {
          // Check if process is running by sending signal 0
          // This doesn't actually send a signal, just checks if process exists
          try {
            process.kill(pid, 0);
            // Process exists, another daemon is running
            logger.warn(
              `Daemon already running with PID ${pid}, cannot start another instance`
            );
            return false;
          } catch (err) {
            // Process doesn't exist, stale PID file
            logger.info(`Removing stale PID file for process ${pid}`);
            unlinkSync(this.pidFile);
          }
        }
      }

      // Write our PID to the file
      writeFileSync(this.pidFile, String(process.pid), 'utf8');
      logger.info(`Acquired PID file with process ID ${process.pid}`);
      return true;
    } catch (err) {
      logger.error('Failed to acquire PID file', err);
      return false;
    }
  }

  /**
   * Release the PID file on shutdown
   */
  async release(): Promise<void> {
    try {
      if (existsSync(this.pidFile)) {
        unlinkSync(this.pidFile);
        logger.info('Released PID file');
      }
    } catch (err) {
      logger.error('Failed to release PID file', err);
    }
  }

  /**
   * Get the path to the PID file (useful for debugging)
   */
  getPIDFilePath(): string {
    return this.pidFile;
  }
}
