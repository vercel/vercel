import type { Deployment } from '@vercel-internals/types';
import chalk from 'chalk';
import { format } from 'date-fns';
import ms from 'ms';
import jsonlines from 'jsonlines';
import split from 'split2';
import { Readable } from 'node:stream';
import { URLSearchParams } from 'url';
import type Client from '../util/client';
import printEvents from './events';
import { CommandTimeout } from '../commands/logs/command';
import output from '../output-manager';
import stripAnsi from 'strip-ansi';

type Printer = (l: string) => void;

export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow: boolean = true
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
      quiet: false,
      findOpts: { direction: 'forward', follow },
    },
    abortController
  );
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

export interface DisplayRuntimeLogsOptions {
  projectId?: string;
  deploymentId: string;
  parse?: boolean;
}

const runtimeLogSpinnerMessage = `waiting for new logs...`;

export interface RuntimeLog {
  level: 'error' | 'warning' | 'info';
  message: string;
  rowId: string;
  source:
    | 'delimiter'
    | 'edge-function'
    | 'edge-middleware'
    | 'serverless'
    | 'request';
  timestampInMs: number;
  domain: string;
  messageTruncated: boolean;
  requestMethod: string;
  requestPath: string;
  responseStatusCode: number;
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

export async function displayRuntimeLogs(
  client: Client,
  options: DisplayRuntimeLogsOptions,
  abortController: AbortController
): Promise<number> {
  const { log, debug, print, spinner, stopSpinner, warn } = output;
  const { projectId, deploymentId, parse } = options;

  const query = new URLSearchParams({ format: 'lines' });

  const url = `/v1/projects/${projectId}/deployments/${deploymentId}/runtime-logs?${query}`;
  spinner(runtimeLogSpinnerMessage);
  const timeout = setTimeout(() => {
    abortController.abort();
    warn(
      `${chalk.bold(
        `Command automatically interrupted after ${CommandTimeout}.`
      )}\n`
    );
  }, ms(CommandTimeout));

  const response = await client.fetch(url, {
    json: false,
    signal: abortController.signal,
    retry: {
      retries: 3,
      onRetry: err => {
        log(`Runtime logs error: ${err.message}`);
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        throw err;
      },
    },
  });
  // handle the event stream and make the promise get rejected
  // if errors occur so we can retry
  return new Promise<number>((resolve, reject) => {
    const body = Readable.fromWeb(
      response.body as import('node:stream/web').ReadableStream
    );
    const stream = body.pipe(parse ? jsonlines.parse() : split());
    let finished = false;
    let errored = false;

    function finish(err?: unknown) {
      if (finished) return;
      clearTimeout(timeout);
      stopSpinner();
      finished = true;
      if (err) {
        reject(err);
      } else {
        resolve(abortController.signal.aborted ? 1 : 0);
      }
    }

    const handleData = (data: RuntimeLog | string) => {
      const log: RuntimeLog = parse ? data : JSON.parse(data as string);
      stopSpinner();
      if (isRuntimeLimitDelimiter(log)) {
        abortController.abort();
        warn(`${chalk.bold(log.message)}\n`);
        return;
      }
      parse
        ? prettyPrintLogline(log, print)
        : printRawLogLine(data as string, client);
      spinner(runtimeLogSpinnerMessage);
    };

    const handleError = (err: Error) => {
      if (finished || errored) return;
      if (err.name === 'AbortError') {
        finish();
        return;
      }
      stream.destroy();
      errored = true;
      debug(`Runtime logs stream error: ${err.message ?? err}`);

      setTimeout(() => {
        if (abortController.signal.aborted) return;
        // retry without maximum amount nor clear past logs etc
        displayRuntimeLogs(client, options, abortController).then(
          resolve,
          reject
        );
      }, 2000);
    };

    stream.on('end', finish);
    stream.on('data', handleData);
    stream.on('error', handleError);
    body.on('error', handleError);
  });
}

function printBuildLog(log: BuildLog, print: Printer) {
  if (!log.created) return; // ignore keepalive which are the only logs without a creation date.

  const date = new Date(log.created).toISOString();
  const cleanText = parseLogLines(log).join('\n');

  for (const line of colorize(cleanText, log).split('\n')) {
    print(`${chalk.dim(date)}  ${line}\n`);
  }
}

function isRuntimeLimitDelimiter(log: RuntimeLog) {
  return (
    log.rowId === '' && log.level === 'error' && log.source === 'delimiter'
  );
}

function printRawLogLine(data: string, client: Client) {
  client.stdout.write(`${data}\n`);
}

const dateTimeFormat = 'HH:mm:ss.SS';
const moreSymbol = '\u2026';
const statusWidth = 3;

function prettyPrintLogline(
  {
    level,
    domain,
    requestPath: path,
    responseStatusCode: status,
    requestMethod: method,
    message,
    messageTruncated,
    timestampInMs,
    source,
  }: RuntimeLog,
  print: Printer
) {
  const date = format(timestampInMs, dateTimeFormat);
  const levelIcon = getLevelIcon(level);
  const sourceIcon = getSourceIcon(source);
  const detailsLine = `${chalk.dim(date)}  ${levelIcon}  ${chalk.bold(
    method
  )}  ${chalk.grey(status <= 0 ? '---' : status)}  ${chalk.dim(
    domain
  )}  ${sourceIcon}  ${path}`;
  print(
    `${detailsLine}\n${'-'.repeat(
      [
        date.length,
        levelIcon.length,
        method.length,
        statusWidth,
        domain.length,
        sourceIcon.length,
        path.length,
      ].reduce((sum, length) => sum + 2 + length)
    )}\n`
  );
  print(
    `${message.replace(/\n$/, '')}${messageTruncated ? moreSymbol : ''}\n\n`
  );
}

function getLevelIcon(level: string) {
  return level === 'error' ? '🚫' : level === 'warning' ? '⚠️' : 'ℹ️';
}

function getSourceIcon(source: string) {
  if (source === 'edge-function') return 'ന';
  if (source === 'edge-middleware') return 'ɛ';
  if (source === 'serverless') return 'ƒ';
  return ' ';
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
