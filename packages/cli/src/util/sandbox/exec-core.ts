/**
 * Shared sandbox exec core, consumed by the PR #2 command handlers: `exec`
 * (Task 6), `create`/`fork` `--connect` (Tasks 7/10), `connect` (Task 8),
 * `sh` (Task 9), and `run` (Task 11).
 */

import type { Sandbox } from '@vercel/sandbox';
import chalk from 'chalk';
import ms from 'ms';
import { printCommand } from './print-command';
import { startInteractiveShell } from './interactive-shell';

export async function execInSandbox(params: {
  sandbox: Sandbox;
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  sudo: boolean;
  interactive: boolean;
  skipExtendingTimeout: boolean;
  timeout?: string;
}): Promise<void> {
  const {
    sandbox,
    command,
    args,
    cwd,
    env,
    sudo,
    interactive,
    skipExtendingTimeout,
    timeout,
  } = params;

  if (interactive && timeout) {
    throw new Error(
      [
        '--timeout cannot be combined with --interactive.',
        `${chalk.bold('hint:')} Remove one of the two flags. Interactive sessions do not enforce a command timeout.`,
      ].join('\n')
    );
  }

  if (interactive && !process.stdout.isTTY) {
    throw new Error(
      [
        'The --interactive flag requires a terminal (TTY).',
        `${chalk.bold('hint:')} Run this command in an interactive terminal, or remove --interactive to run non-interactively.`,
      ].join('\n')
    );
  }

  if (!interactive) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(printCommand(command, args));
    const result = await sandbox.runCommand({
      cmd: command,
      args,
      stdout: process.stdout,
      stderr: process.stderr,
      sudo,
      cwd,
      env,
      timeoutMs: timeout ? ms(timeout) : undefined,
    });

    if (timeout && result.exitCode === 137) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(
        `${chalk.yellow('Command was killed (SIGKILL, exit code 137)')}.`
      );
    }

    process.exitCode = result.exitCode;
  } else {
    await startInteractiveShell({
      sandbox,
      cwd,
      execution: [command, ...args],
      envVars: env,
      sudo,
      skipExtendingTimeout,
    });
  }
}

export async function connectToSandbox(sandbox: Sandbox): Promise<void> {
  await execInSandbox({
    sandbox,
    command: 'sh',
    args: [],
    env: {},
    sudo: false,
    interactive: true,
    skipExtendingTimeout: false,
    cwd: undefined,
    timeout: undefined,
  });
}

export function assertInteractivePort(
  sandbox: Sandbox,
  verb: 'created' | 'forked'
): void {
  if (!sandbox.interactivePort) {
    throw new Error(
      [
        `Sandbox ${verb} but interactive port is missing.`,
        `${chalk.bold('hint:')} This is an internal error. Please try again.`,
        '╰▶ Report this issue: https://github.com/vercel/sandbox/issues',
      ].join('\n')
    );
  }
}
