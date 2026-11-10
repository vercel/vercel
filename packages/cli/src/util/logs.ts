import type { Deployment } from '@vercel-internals/types';
import type { DeploymentAliasAssignedEvent } from '@vercel/client';
import chalk from 'chalk';
import type Client from '../util/client';
import printEvents from './events';
import output from '../output-manager';
import stripAnsi from 'strip-ansi';

type Printer = (l: string) => void;

export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow: boolean = true,
  onAliasAssigned?: (event: DeploymentAliasAssignedEvent) => void
): {
  promise: Promise<void>;
  abortController: AbortController;
} {
  const abortController = new AbortController();
  const promise = printEvents(
    client,
    deployment.id,
    {
      mode: 'logs',
      onEvent: (event: BuildLog) => printBuildLog(event, output.print),
      onAliasAssigned,
      quiet: false,
      findOpts: { direction: 'forward', follow },
    },
    abortController
  );
  return { promise, abortController };
}

export function collectBuildLogs(
  client: Client,
  deployment: Deployment,
  follow: boolean = true
): {
  promise: Promise<BuildLog[]>;
  abortController: AbortController;
} {
  const logs: BuildLog[] = [];
  const abortController = new AbortController();
  const promise = printEvents(
    client,
    deployment.id,
    {
      mode: 'logs',
      onEvent: (event: BuildLog) => {
        if (event.created) {
          logs.push(event);
        }
      },
      quiet: true,
      findOpts: { direction: 'forward', follow },
    },
    abortController
  ).then(() => logs);
  return { promise, abortController };
}

export async function displayBuildLogsUntilFinalError(
  client: Client,
  deployment: Deployment,
  error: string
) {
  const abortController = new AbortController();
  return printEvents(
    client,
    deployment.id,
    {
      mode: 'logs',
      onEvent: (event: BuildLog) => {
        printBuildLog(event, output.print);
        if (event.level === 'error' && event.text?.includes(error)) {
          abortController.abort();
        }
      },
      quiet: false,
      findOpts: { direction: 'forward', follow: true },
    },
    abortController
  );
}

export interface BuildLog {
  created: number;
  date: number;
  deploymentId: string;
  id: string;
  info: LogInfo;
  serial: string;
  text?: string;
  type: LogType;
  level?: 'error' | 'warning';
}

export interface LogInfo {
  type: string;
  name: string;
  entrypoint?: string;
  path?: string;
  step?: string;
  readyState?: string;
}

export type LogType =
  | 'command'
  | 'stdout'
  | 'stderr'
  | 'exit'
  | 'deployment-state'
  | 'delimiter'
  | 'middleware'
  | 'middleware-invocation'
  | 'edge-function-invocation'
  | 'fatal';

function printBuildLog(log: BuildLog, print: Printer) {
  if (!log.created) return; // ignore keepalive which are the only logs without a creation date.

  const date = new Date(log.created).toISOString();
  const cleanText = parseLogLines(log).join('\n');

  for (const line of colorize(cleanText, log).split('\n')) {
    print(`${chalk.dim(date)}  ${line}\n`);
  }
}

function sanitize(log: BuildLog): string {
  return stripAnsi(log.text || '')
    .replace(/\n$/, '')
    .replace(/^\n/, '');
}

export function parseLogLines(log: BuildLog): string[] {
  const text = sanitize(log);
  return text
    .split('\n')
    .map(line => line.replace('[now-builder-debug] ', '').trim());
}

function colorize(text: string, log: BuildLog): string {
  if (log.level === 'error') {
    return chalk.red(text);
  } else if (log.level === 'warning') {
    return chalk.yellow(text);
  }

  return text;
}
