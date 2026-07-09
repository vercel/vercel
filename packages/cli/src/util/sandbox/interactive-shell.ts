import type { Sandbox } from '@vercel/sandbox';
import createDebugger from 'debug';
import { WebSocket } from 'ws';
import ora from 'ora';
import chalk from 'chalk';
import { printCommand } from './print-command';
import { acquireRelease, createAbortController, defer } from './disposables';
import { extendSandboxTimeoutPeriodically } from './extend-timeout';

const debug = createDebugger('sandbox:interactive-shell');

const TERM = 'xterm-256color';

const PS1 = `▲ \x01\x1b[2m\x02$PWD/\x01\x1b[0m\x02 `;

export async function startInteractiveShell(options: {
  sandbox: Sandbox;
  cwd?: string;
  execution: [string, ...string[]];
  envVars: Record<string, string>;
  sudo: boolean;
  skipExtendingTimeout: boolean;
}): Promise<void> {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }

    process.stdin.removeAllListeners();
    try {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.unref();
    } catch {}
    cleaned = true;
  };
  process.once('beforeExit', cleanup);
  using _cleanup = defer(cleanup);

  using progress = acquireRelease(
    () => ora().start(),
    s => s.stop()
  );

  progress.text = 'Opening interactive session...';
  const { url, token } = await options.sandbox.openInteractive();

  const [command, ...args] = options.execution;
  const execution: [string, ...string[]] = options.sudo
    ? ['sudo', command, ...args]
    : [command, ...args];

  progress.text = 'Connecting...';
  const client = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
  using _client = defer(() => {
    try {
      client.close();
    } catch {}
  });

  await new Promise<void>((resolve, reject) => {
    client.once('open', () => resolve());
    client.once('error', err => reject(err));
  });
  debug('connected to %s', url);

  client.send(
    JSON.stringify({
      type: 'start',
      command: execution[0],
      args: execution.slice(1),
      env: toEnvArray({ TERM, PS1, ...options.envVars }),
      cwd: options.cwd ?? options.sandbox.cwd,
      cols: process.stdout.columns,
      rows: process.stdout.rows,
    })
  );

  progress.stop();

  using extension = createAbortController('stopped extensions');
  if (!options.skipExtendingTimeout) {
    extendSandboxTimeoutPeriodically(options.sandbox, extension.signal).catch(
      extension.ignoreInterruptions
    );
  }

  client.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      process.stdout.write(data as unknown as Uint8Array);
      return;
    }
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'exit') {
        process.exitCode = typeof msg.code === 'number' ? msg.code : undefined;
      }
    } catch {
      process.stdout.write(data as unknown as Uint8Array);
    }
  });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  const onStdin = (chunk: Buffer) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(chunk);
    }
  };
  process.stdin.on('data', onStdin);

  const onResize = () => {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(
      JSON.stringify({
        type: 'resize',
        cols: process.stdout.columns,
        rows: process.stdout.rows,
      })
    );
  };
  process.on('SIGWINCH', onResize);

  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error(printCommand(options.execution[0], options.execution.slice(1)));

  await new Promise<void>((resolve, reject) => {
    client.once('close', () => resolve());
    client.once('error', err => reject(err));
  });

  extension.abort('client disconnected');
  process.removeListener('SIGWINCH', onResize);
  process.stdin.removeListener('data', onStdin);

  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error(
    chalk.dim(`\n╰▶ connection to ▲ ${options.sandbox.name} closed.`)
  );
}

function toEnvArray(env: Record<string, string>): string[] {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`);
}
