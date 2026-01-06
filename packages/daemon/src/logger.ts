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

  private formatTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}:${seconds}`;
  }

  private formatMeta(meta: any): string {
    if (!meta) return '';

    // Handle simple types
    if (typeof meta === 'string' || typeof meta === 'number') {
      return ` ${meta}`;
    }

    // Format objects as key=value pairs
    if (typeof meta === 'object') {
      const pairs = Object.entries(meta).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}="${value}"`;
        }
        return `${key}=${value}`;
      });
      return ` (${pairs.join(', ')})`;
    }

    return ` ${JSON.stringify(meta)}`;
  }

  private write(level: string, message: string, meta?: any) {
    const timestamp = this.formatTimestamp();
    const levelPadded = level.padEnd(5); // Align log levels
    const metaStr = this.formatMeta(meta);
    const line = `${timestamp} [${levelPadded}] ${message}${metaStr}\n`;

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
