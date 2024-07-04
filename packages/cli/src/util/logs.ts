import type { Deployment } from '@vercel-internals/types';
import chalk from 'chalk';
import { format } from 'date-fns';
import ms from 'ms';
import jsonlines from 'jsonlines';
import split from 'split2';
import { URLSearchParams } from 'url';
import Client from '../util/client';
import printEvents from './events';
import { CommandTimeout } from '../commands/logs/command';

type Printer = (l: string) => void;

export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow?: true
): {
  promise: Promise<void>;
  abortController: AbortController;
};
export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow: false
): {
  promise: Promise<void>;
  abortController: AbortController;
};
export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow: boolean = true
) {
  const abortController = new AbortController();
  const promise = printEvents(
    client,
    deployment.id,
    {
      mode: 'logs',
      onEvent: (event: any) => printBuildLog(event, client.output.print),
      quiet: false,
      findOpts: { direction: 'forward', follow },
    },
    abortController
  );
  return { promise, abortController };
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

export async function displayRuntimeLogs(
  client: Client,
  options: DisplayRuntimeLogsOptions,
  abortController: AbortController
): Promise<number> {
  const { log, debug, print, spinner, stopSpinner, warn } = client.output;
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
    // @ts-expect-error: typescipt is getting confused with the signal types from node (web & server) and node-fetch (server only)
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
    const stream = response.body.pipe(parse ? jsonlines.parse() : split());
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
      let log: RuntimeLog = parse ? data : JSON.parse(data as string);
      if (isRuntimeLimitDelimiter(log)) {
        abortController.abort();
        warn(`${chalk.bold(log.message)}\n`);
        return;
      }
      // eslint-disable-next-line no-console -- we intent to write unparsed logs to stdout so JQ could read them
      parse ? prettyPrintLogline(log, print) : console.log(data);
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
    response.body.on('error', handleError);
  });
}

function printBuildLog(log: any, print: Printer) {
  if (!log.created) return; // keepalive

  let data: string;

  data = (log.text || '')
    .replace(/\n$/, '')
    .replace(/^\n/, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[1000D/g, '')
    .replace(/\x1b\[0K/g, '')
    .replace(/\x1b\[1A/g, '');
  if (/warning/i.test(data)) {
    data = chalk.yellow(data);
  } else if (log.type === 'stderr') {
    data = chalk.red(data);
  }

  const date = new Date(log.created).toISOString();

  data.split('\n').forEach(line => {
    print(`${chalk.dim(date)}  ${line.replace('[now-builder-debug] ', '')}\n`);
  });
}

function isRuntimeLimitDelimiter(log: RuntimeLog) {
  return (
    log.rowId === '' && log.level === 'error' && log.source === 'delimiter'
  );
}

const dateTimeFormat = 'MMM dd HH:mm:ss.SS';
const statusWidth = 3;
const methodWidth = 7;
const domainWidth = 20;
const pathWidth = 30;
// padding for date, method, status, domain and path, all separated by 2 spaces
const multiLintPadding = ' '.repeat(
  [
    dateTimeFormat.length,
    methodWidth,
    statusWidth,
    domainWidth,
    pathWidth,
  ].reduce((sum, width) => sum + 2 + width)
);

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
  const lines = message.replace(/\n$/, '').split('\n');
  for (const i of lines.keys()) {
    const displayedLine = getDisplayedLine(i, lines, messageTruncated);
    if (i === 0) {
      print(
        `${getLevelIcon(level)}  ${chalk.dim(
          format(timestampInMs, dateTimeFormat)
        )}  ${chalk.bold(toFixedWidth(method, 7))} ${chalk.grey(
          status <= 0 ? '---' : status
        )}  ${chalk.dim(toFixedWidth(domain, 20))} ${getSourceIcon(source)} ${
          displayedLine ? toFixedWidth(path, 30) : path
        }  ${displayedLine}\n`
      );
    } else {
      print(`    ${multiLintPadding}  ${displayedLine}\n`);
    }
  }
}

// function prettyPrintLogline(
//   {
//     level,
//     domain,
//     requestPath: path,
//     responseStatusCode: status,
//     requestMethod: method,
//     message,
//     messageTruncated,
//     timestampInMs,
//     source,
//   }: RuntimeLog,
//   print: Printer
// ) {
//   print(
//     `${getLevelIcon(level)}  ${chalk.dim(
//       format(timestampInMs, dateTimeFormat)
//     )}  ${chalk.bold(toFixedWidth(method, 7))} ${chalk.grey(
//       status <= 0 ? '---' : status
//     )}  ${chalk.dim(toFixedWidth(domain, 20))} ${getSourceIcon(
//       source
//     )} ${path}\n`
//   );
//   print(`${message.replace(/\n$/, '')}${messageTruncated ? '\u2026' : ''}\n`);
// }

function getDisplayedLine(rank: number, lines: string[], truncated: boolean) {
  if (lines.length === 1 && lines[0] === '-') return '';
  const separator = getSeparator(rank, lines.length);
  const line =
    rank === lines.length - 1 && truncated
      ? `${lines[rank]}\u2026`
      : lines[rank];
  return `  ${separator} ${line}`;
}

function getLevelIcon(level: string) {
  return level === 'error' ? '❌' : level === 'warning' ? '⚠️' : 'ℹ️';
}

function getSourceIcon(source: string) {
  if (source === 'edge-function') return 'ന';
  if (source === 'edge-middleware') return 'ɛ';
  if (source === 'serverless') return 'ƒ';
  return ' ';
}

function getSeparator(current: number, max: number) {
  // https://en.wikipedia.org/wiki/Miscellaneous_Technical#Block
  // special UTF characters for a better vertical line
  if (current === 0 && max === 1) return '⏵';
  if (current === 0) return '⎛';
  if (current === max - 1) return '⎝';
  return '⎟';
}

function toFixedWidth(value: string, width: number) {
  if (!value) return ' '.repeat(width);
  return value.length < width
    ? value.padEnd(width, ' ')
    : value.slice(0, width - 1) + '\u2026';
}
