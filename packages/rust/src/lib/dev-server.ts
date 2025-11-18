import { ChildProcess } from 'child_process';
import { debug } from '@vercel/build-utils';

export async function waitForServerStart(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let portFound = false;
    const timeout = 30000; // 30 seconds timeout

    debug('Waiting for dev server to start and report port...');

    const handleOutput = (data: Buffer) => {
      const output = data.toString();
      debug(`Dev server output: ${output.trim()}`);

      // Look for various patterns that might indicate server start
      const portPatterns = [
        /Server listening on .*:(\d+)/i,
        /Listening on port (\d+)/i,
        /Started server on .*:(\d+)/i,
        /Running on .*:(\d+)/i,
        /DEV_SERVER_PORT:(\d+)/i, // Custom pattern for explicit port reporting
      ];

      for (const pattern of portPatterns) {
        const match = output.match(pattern);
        if (match && !portFound) {
          portFound = true;
          const port = parseInt(match[1], 10);
          debug(`Dev server started on port ${port}`);
          resolve(port);
          return;
        }
      }
    };

    // Listen to both stdout and stderr for port information
    child.stdout?.on('data', handleOutput);
    child.stderr?.on('data', handleOutput);

    child.on('exit', (code, signal) => {
      if (!portFound) {
        const reason = signal ? `signal ${signal}` : `exit code ${code}`;
        reject(
          new Error(`Dev server exited with ${reason} before reporting port`)
        );
      }
    });

    child.on('error', err => {
      if (!portFound) {
        reject(new Error(`Dev server process error: ${err.message}`));
      }
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!portFound) {
        child.kill('SIGKILL'); // Force kill if timeout
        reject(new Error(`Dev server failed to start within ${timeout}ms`));
      }
    }, timeout);

    // Clear timeout when port is found
    if (portFound) {
      clearTimeout(timeoutId);
    }
  });
}

export async function waitForProcessExit(child: ChildProcess): Promise<void> {
  return new Promise(resolve => {
    let resolved = false;

    const handleExit = () => {
      if (!resolved) {
        resolved = true;
        debug('Dev server process exited');
        resolve();
      }
    };

    child.on('exit', handleExit);
    child.on('close', handleExit);

    // Fallback timeout in case the process doesn't exit properly
    setTimeout(() => {
      if (!resolved) {
        debug('Dev server process exit timeout, forcing resolution');
        resolved = true;
        resolve();
      }
    }, 5000);
  });
}

export function createDevServerEnv(
  baseEnv: Record<string, string | undefined>,
  meta: any = {}
): Record<string, string> {
  const devEnv: Record<string, string> = {
    // Base environment
    ...(Object.fromEntries(
      Object.entries(baseEnv).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>),

    // Development-specific variables
    VERCEL_DEV: '1',
    RUST_LOG: process.env.RUST_LOG || 'info',

    // Runtime environment from meta
    ...(meta.env || {}),
  };

  // Remove undefined values
  Object.keys(devEnv).forEach(key => {
    if (devEnv[key] === undefined) {
      delete devEnv[key];
    }
  });

  debug(`Dev server environment: ${Object.keys(devEnv).join(', ')}`);
  return devEnv;
}
