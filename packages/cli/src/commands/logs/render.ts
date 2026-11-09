import chalk from 'chalk';
import format from 'date-fns/format';
import stripAnsi from 'strip-ansi';
import type { LogsSourceName } from './sources';
import type { LogEvent } from './query';
import type { LogsTimeRange } from './time-range';

const TIME_ONLY_FORMAT = 'HH:mm:ss.SSS';
const DATE_TIME_FORMAT = 'MMM DD HH:mm:ss.SSS';

const LEVEL_WIDTH = 7;
const PRODUCER_WIDTH = 16;
const STATUS_WIDTH = 6;
const METHOD_WIDTH = 7;
const CACHE_WIDTH = 9;
// Live request IDs are 32 characters, e.g. `lbllf-1791446073048-9cbcd093668c`.
// Longer IDs (region-prefixed) are shown in full and push the path right.
const REQUEST_ID_WIDTH = 32;

// Remote text is data: drop ANSI sequences and control characters, but keep
// newlines and tabs so stack traces stay readable.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function sanitize(value: string): string {
  return stripAnsi(value.replace(/\r\n?/g, '\n')).replace(
    CONTROL_CHARACTERS,
    ''
  );
}

function text(event: LogEvent, field: string): string {
  const value = event[field];
  if (value === null || value === undefined) return '';
  return sanitize(typeof value === 'string' ? value : String(value));
}

function cell(value: string, width: number): string {
  return (value || '-').padEnd(width);
}

/** Uses date-free timestamps when the whole window falls on one local day. */
export function timeFormatFor(range: LogsTimeRange): string {
  return range.start.toDateString() ===
    new Date(range.end.getTime() - 1).toDateString() &&
    range.end.toDateString() === new Date().toDateString()
    ? TIME_ONLY_FORMAT
    : DATE_TIME_FORMAT;
}

function formatTime(event: LogEvent, timeFormat: string): string {
  const value = event.timestamp;
  const date =
    typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : undefined;
  if (!date || isNaN(date.getTime())) return text(event, 'timestamp') || '-';
  return format(date, timeFormat);
}

function colorizeLevel(value: string, level: string): string {
  switch (level) {
    case 'fatal':
      return chalk.red.bold(value);
    case 'error':
      return chalk.red(value);
    case 'warning':
      return chalk.yellow(value);
    default:
      return chalk.dim(value);
  }
}

function colorizeStatus(value: string, status: number): string {
  if (status >= 500) return chalk.red(value);
  if (status >= 400) return chalk.yellow(value);
  if (status >= 300) return chalk.cyan(value);
  if (status >= 200) return chalk.green(value);
  return chalk.gray(value);
}

export interface Renderer {
  header(): string;
  row(event: LogEvent): string;
}

function runtimeRenderer(timeFormat: string, timeWidth: number): Renderer {
  const messageIndent = ' '.repeat(
    timeWidth + LEVEL_WIDTH + PRODUCER_WIDTH + 6
  );
  return {
    header: () =>
      chalk.dim(
        [
          'TIME'.padEnd(timeWidth),
          'LEVEL'.padEnd(LEVEL_WIDTH),
          'SERVICE/SOURCE'.padEnd(PRODUCER_WIDTH),
          'MESSAGE',
        ].join('  ')
      ),
    row: event => {
      const level = text(event, 'level');
      const producer = text(event, 'service') || text(event, 'source');
      const message = text(event, 'message').replace(/\n+$/, '');
      const [first = '', ...rest] = message.split('\n');
      const truncated = event.truncated === true;
      const lines = [
        [
          chalk.dim(formatTime(event, timeFormat).padEnd(timeWidth)),
          colorizeLevel(cell(level, LEVEL_WIDTH), level),
          cell(producer, PRODUCER_WIDTH),
          first || (rest.length === 0 ? chalk.dim('(no message)') : ''),
        ].join('  '),
        ...rest.map(line => `${messageIndent}${line}`),
      ];
      if (truncated) {
        lines.push(`${messageIndent}${chalk.yellow('[message truncated]')}`);
      }
      return lines.join('\n');
    },
  };
}

function requestsRenderer(timeFormat: string, timeWidth: number): Renderer {
  return {
    header: () =>
      chalk.dim(
        [
          'TIME'.padEnd(timeWidth),
          'STATUS'.padEnd(STATUS_WIDTH),
          'METHOD'.padEnd(METHOD_WIDTH),
          'CACHE'.padEnd(CACHE_WIDTH),
          'REQUEST ID'.padEnd(REQUEST_ID_WIDTH),
          'HOST AND PATH',
        ].join('  ')
      ),
    row: event => {
      const status = event.httpStatus;
      const statusText =
        typeof status === 'number' && status > 0 ? String(status) : '-';
      const statusCell = statusText.padEnd(STATUS_WIDTH);
      return [
        chalk.dim(formatTime(event, timeFormat).padEnd(timeWidth)),
        typeof status === 'number'
          ? colorizeStatus(statusCell, status)
          : statusCell,
        cell(text(event, 'requestMethod'), METHOD_WIDTH),
        cell(text(event, 'cacheResult'), CACHE_WIDTH),
        // Shown in full: `requestId` filters match the stored value exactly.
        cell(text(event, 'requestId'), REQUEST_ID_WIDTH),
        `${text(event, 'requestHostname')}${text(event, 'requestPath')}` || '-',
      ].join('  ');
    },
  };
}

export function createRenderer(
  source: LogsSourceName,
  range: LogsTimeRange
): Renderer {
  const timeFormat = timeFormatFor(range);
  const timeWidth = format(new Date(0), timeFormat).length;
  return source === 'runtime'
    ? runtimeRenderer(timeFormat, timeWidth)
    : requestsRenderer(timeFormat, timeWidth);
}

/** A window for stderr context, e.g. `2026-10-07 13:30:00 to 14:00:00`. */
export function formatWindow(range: LogsTimeRange): string {
  const sameDay = range.start.toDateString() === range.end.toDateString();
  const start = format(range.start, 'YYYY-MM-DD HH:mm:ss');
  const end = format(range.end, sameDay ? 'HH:mm:ss' : 'YYYY-MM-DD HH:mm:ss');
  const zone = format(range.end, 'Z');
  return `${start} to ${end} (UTC${zone})`;
}
