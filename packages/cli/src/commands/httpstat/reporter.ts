import chalk from 'chalk';
import type { HttpstatResult } from './httpstat-core';

export interface ReporterOptions {
  showBody?: boolean;
  jsonOutput?: boolean;
  noColor?: boolean;
}

const HTTPS_TEMPLATE =
  `` +
  `  DNS Lookup   TCP Connection   SSL Handshake   Server Processing   Content Transfer` +
  '\n' +
  `[ %s  |     %s  |        %s  |       %s  |         %s  ]` +
  '\n' +
  `             |                |                   |                  |                    |` +
  '\n' +
  `    namelookup:%s      |                   |                  |                    |` +
  '\n' +
  `                        connect:%s         |                  |                    |` +
  '\n' +
  `                                    pretransfer:%s            |                    |` +
  '\n' +
  `                                                      starttransfer:%s             |` +
  '\n' +
  `                                                                                 total:%s` +
  '\n';

const HTTP_TEMPLATE =
  `` +
  `   DNS Lookup   TCP Connection   Server Processing   Content Transfer` +
  '\n' +
  `[ %s  |     %s  |        %s  |       %s  ]` +
  '\n' +
  `             |                |                   |                  |` +
  '\n' +
  `    namelookup:%s      |                   |                  |` +
  '\n' +
  `                        connect:%s         |                  |` +
  '\n' +
  `                                      starttransfer:%s        |` +
  '\n' +
  `                                                                 total:%s` +
  '\n';

function formatDuration(ms: number): string {
  // Match original sprintf("%7dms", duration) format - 7 chars total including "ms"
  const value = Math.round(ms).toString();
  return `${value.padStart(7 - 2)}ms`;
}

function formatCumulativeDuration(ms: number): string {
  // Match original sprintf("%-9s", duration + 'ms') format
  return `${Math.round(ms)}ms`.padEnd(9);
}

export function generateReport(
  result: HttpstatResult,
  options: ReporterOptions = {}
): string {
  const { url, response, stats } = result;
  const isHttps = url.protocol === 'https:';

  let output = '';

  // Protocol and status line
  const protocol = isHttps ? 'HTTPS' : 'HTTP';
  const protocolLine = `${protocol}/${response.httpVersion} ${response.statusCode}`;

  if (options.jsonOutput) {
    const jsonData = {
      url: url.toString(),
      protocol: protocol.toLowerCase(),
      statusCode: response.statusCode,
      statusMessage: response.statusMessage,
      headers: response.headers,
      timing: {
        dnsLookup: stats.dnsLookupDuration,
        tcpConnection: stats.tcpConnectionDuration,
        sslHandshake: isHttps ? stats.sslHandshakeDuration : undefined,
        serverProcessing: stats.serverProcessingDuration,
        contentTransfer: stats.contentTransferDuration,
        total: stats.totalDuration,
      },
    };

    if (options.showBody) {
      (jsonData as any).body = response.body;
    }

    return JSON.stringify(jsonData, null, 2);
  }

  const colorize = options.noColor
    ? (str: string) => str
    : {
        green: (str: string) => chalk.green(str),
        cyan: (str: string) => chalk.cyan(str),
        white: (str: string) => chalk.white(str),
        gray: (str: string) => chalk.gray(str),
      };

  // Status line
  output += `\n${typeof colorize === 'function' ? protocolLine : colorize.green(protocol)}${typeof colorize === 'function' ? '' : colorize.white('/')}${typeof colorize === 'function' ? '' : `${response.httpVersion} ${response.statusCode}`}\n`;

  // Headers
  Object.entries(response.headers).forEach(([key, value]) => {
    const headerLine =
      typeof colorize === 'function'
        ? `${key}: ${value}`
        : `${colorize.white(key + ':')} ${colorize.cyan(value)}`;
    output += headerLine + '\n';
  });

  // Response body
  if (options.showBody && response.body) {
    output += '\n' + response.body + '\n';
  }

  // Format timing values
  const fmta = (duration: number) => {
    const formatted = formatDuration(duration);
    return typeof colorize === 'function'
      ? formatted
      : colorize.cyan(formatted);
  };

  const fmtb = (duration: number) => {
    const formatted = formatCumulativeDuration(duration);
    return typeof colorize === 'function'
      ? formatted
      : colorize.cyan(formatted);
  };

  // Calculate cumulative timings
  const namelookup = stats.dnsLookupDuration;
  const connect = namelookup + stats.tcpConnectionDuration;
  const pretransfer = connect + (isHttps ? stats.sslHandshakeDuration : 0);
  const starttransfer = pretransfer + stats.serverProcessingDuration;
  const total = stats.totalDuration;

  // Timing diagram
  if (isHttps) {
    output += HTTPS_TEMPLATE.replace('%s', fmta(stats.dnsLookupDuration))
      .replace('%s', fmta(stats.tcpConnectionDuration))
      .replace('%s', fmta(stats.sslHandshakeDuration))
      .replace('%s', fmta(stats.serverProcessingDuration))
      .replace('%s', fmta(stats.contentTransferDuration))
      .replace('%s', fmtb(namelookup))
      .replace('%s', fmtb(connect))
      .replace('%s', fmtb(pretransfer))
      .replace('%s', fmtb(starttransfer))
      .replace('%s', fmtb(total));
  } else {
    output += HTTP_TEMPLATE.replace('%s', fmta(stats.dnsLookupDuration))
      .replace('%s', fmta(stats.tcpConnectionDuration))
      .replace('%s', fmta(stats.serverProcessingDuration))
      .replace('%s', fmta(stats.contentTransferDuration))
      .replace('%s', fmtb(namelookup))
      .replace('%s', fmtb(connect))
      .replace('%s', fmtb(starttransfer))
      .replace('%s', fmtb(total));
  }

  return output;
}

export function printReport(
  result: HttpstatResult,
  options: ReporterOptions = {}
): void {
  const report = generateReport(result, options);
  // eslint-disable-next-line no-console
  console.log(report);
}
