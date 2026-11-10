import { accessSync, constants, realpathSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';

const NODE_EXEC_PATH_ENV = 'VERCEL_NODE_EXEC_PATH';
const NATIVE_CLI_ENV = 'VERCEL_VC_NATIVE';

/**
 * Returns the executable that should be used to run Node.js scripts.
 *
 * In the standalone Vercel CLI, `process.execPath` points to the CLI binary
 * rather than Node.js. Resolve Node.js lazily from PATH so commands that do not
 * execute on-disk JavaScript can still run when Node.js is unavailable.
 */
export function getNodeExecPath(): string {
  const override = process.env[NODE_EXEC_PATH_ENV];
  if (override) return override;
  if (!process.env[NATIVE_CLI_ENV]) return process.execPath;

  const nodeExecPath = findNodeExecPath();
  process.env[NODE_EXEC_PATH_ENV] = nodeExecPath;
  return nodeExecPath;
}

function findNodeExecPath(): string {
  const executableName = process.platform === 'win32' ? 'node.exe' : 'node';
  const cliPath = realpathSync(process.execPath);

  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, executableName);
    try {
      accessSync(candidate, constants.X_OK);
      if (realpathSync(candidate) !== cliPath) return candidate;
    } catch {
      // Keep searching PATH.
    }
  }

  throw new Error('Could not find the Node.js executable in PATH.');
}
