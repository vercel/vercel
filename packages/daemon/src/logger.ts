import { join } from 'path';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { homedir, platform } from 'os';

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

export class Logger {
  private logPath: string;

  constructor() {
    const dataDir = getUserDataDir();
    if (!dataDir) {
      throw new Error('Unable to determine user data directory');
    }

    const logDir = join(dataDir, 'com.vercel.cli', 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true, mode: 0o770 });
    }

    this.logPath = join(logDir, 'daemon.log');
  }

  private write(level: string, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const line = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

    try {
      appendFileSync(this.logPath, line);
    } catch (err) {
      // Silently ignore write errors to avoid daemon crashes
    }
  }

  info(message: string, meta?: any) {
    this.write('INFO', message, meta);
  }

  warn(message: string, meta?: any) {
    this.write('WARN', message, meta);
  }

  error(message: string, meta?: any) {
    this.write('ERROR', message, meta);
  }

  debug(message: string, meta?: any) {
    this.write('DEBUG', message, meta);
  }
}

// Singleton logger instance
export const logger = new Logger();
