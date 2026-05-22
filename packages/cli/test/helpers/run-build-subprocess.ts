import { execFileSync } from 'node:child_process';
import path from 'node:path';
import execa from 'execa';

const binaryPath = path.resolve(__dirname, '../../scripts/start.js');

export interface BuildSubprocessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  hangingChildPids: number[];
}

function listChildPids(parentPid: number): number[] {
  if (process.platform === 'win32') {
    return [];
  }

  const cmd =
    process.platform === 'darwin'
      ? ['pgrep', '-P', String(parentPid)]
      : ['ps', '-o', 'pid', '--no-headers', '--ppid', String(parentPid)];

  try {
    const output = execFileSync(cmd[0], cmd.slice(1), { encoding: 'utf8' });
    return (output.match(/\d+/g) ?? []).map(Number);
  } catch {
    return [];
  }
}

/**
 * Run `vercel build` in a child process and fail when the CLI does not exit
 * cleanly. This catches regressions where builders leave the event loop active
 * (e.g. post-build `vite.resolveConfig` handles) and the build container hangs.
 */
export async function runBuildSubprocess(
  cwd: string,
  {
    timeout = 120_000,
    args = ['build', '--yes'],
  }: {
    timeout?: number;
    args?: string[];
  } = {}
): Promise<BuildSubprocessResult> {
  const child = execa('node', [binaryPath, ...args], {
    cwd,
    env: {
      ...process.env,
      NO_UPDATE_NOTIFIER: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
    timeout,
    killSignal: 'SIGKILL',
    reject: false,
    all: true,
  });

  const result = await child;
  const combined = result.all ?? '';
  const hangingChildPids =
    result.pid != null && result.exitCode == null
      ? listChildPids(result.pid)
      : [];

  return {
    exitCode: result.exitCode,
    stdout: combined,
    stderr: combined,
    timedOut: result.timedOut ?? false,
    hangingChildPids,
  };
}
