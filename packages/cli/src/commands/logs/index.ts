import chalk from 'chalk';
import elapsed from '../../util/output/elapsed';
import { maybeURL, normalizeURL } from '../../util/url';
import printEvents, { DeploymentEvent } from '../../util/events';
import getScope from '../../util/get-scope';
import getArgs from '../../util/get-args';
import Client from '../../util/client';
import getDeployment from '../../util/get-deployment';
import { help } from '../help';
import { logsCommand } from './command';

export default async function logs(client: Client) {
  let head;
  let limit;
  let follow;
  let since;
  let until;
  let deploymentIdOrURL;

  const argv = getArgs(client.argv.slice(2), {
    '--since': String,
    '--until': String,
    '--output': String,
    '--limit': Number,
    '--head': Boolean,
    '--follow': Boolean,
    '-f': '--follow',
    '-o': '--output',
    '-n': '--limit',
  });

  argv._ = argv._.slice(1);
  deploymentIdOrURL = argv._[0];
  const { output } = client;

  if (argv['--help'] || !deploymentIdOrURL || deploymentIdOrURL === 'help') {
    output.print(help(logsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  try {
    since = argv['--since'] ? toTimestamp(argv['--since']) : 0;
  } catch (err) {
    output.error(`Invalid date string: ${argv['--since']}`);
    return 1;
  }

  try {
    until = argv['--until'] ? toTimestamp(argv['--until']) : 0;
  } catch (err) {
    output.error(`Invalid date string: ${argv['--until']}`);
    return 1;
  }

  if (maybeURL(deploymentIdOrURL)) {
    const normalizedURL = normalizeURL(deploymentIdOrURL);
    if (normalizedURL.includes('/')) {
      output.error(
        `Invalid deployment url: can't include path (${deploymentIdOrURL})`
      );
      return 1;
    }

    deploymentIdOrURL = normalizedURL;
  }

  head = argv['--head'];
  limit = argv['--limit'] || 100;
  follow = argv['--follow'];
  if (follow) until = 0;
  const logPrinter = getLogPrinter(argv['--output'], 'short');

  const { contextName } = await getScope(client);

  const id = deploymentIdOrURL;

  const depFetchStart = Date.now();
  output.spinner(`Fetching deployment "${id}" in ${chalk.bold(contextName)}`);

  let deployment;
  try {
    deployment = await getDeployment(client, contextName, id);
  } finally {
    output.stopSpinner();
  }

  output.log(
    `Fetched deployment "${deployment.url}" in ${chalk.bold(
      contextName
    )} ${elapsed(Date.now() - depFetchStart)}`
  );

  const storage: DeploymentEvent[] = [];

  let direction = head ? ('forward' as const) : ('backward' as const);
  if (since && !until) direction = 'forward';

  await printEvents(client, deployment.id, {
    mode: 'logs',
    onEvent: event => storage.push(event),
    quiet: false,
    findOpts: {
      direction,
      limit,
      since,
      until,
    },
  });

  const printedEventIds = new Set<string>();
  const printEvent = (event: DeploymentEvent) => {
    if (printedEventIds.has(event.id)) return 0;
    printedEventIds.add(event.id);
    return logPrinter(event);
  };
  storage.sort(compareEvents).forEach(printEvent);

  if (follow) {
    const lastEvent = storage[storage.length - 1];
    // NOTE: the API ignores `since` on follow mode.
    // (but not sure if it's always true on legacy deployments)
    const since2 = lastEvent ? lastEvent.date : Date.now();
    await printEvents(client, deployment.id, {
      mode: 'logs',
      onEvent: printEvent,
      quiet: false,
      findOpts: {
        direction: 'forward',
        since: since2,
        follow: true,
      },
    });
  }

  return 0;
}

function compareEvents(d1: DeploymentEvent, d2: DeploymentEvent) {
  const c1 = d1.date || d1.created;
  const c2 = d2.date || d2.created;
  if (c1 !== c2) return c1 - c2;
  const s1 = d1.serial || '';
  const s2 = d2.serial || '';
  const sc = s1.localeCompare(s2);
  if (sc !== 0) return sc;
  return d1.created - d2.created; // if date are equal and no serial
}

function printLogShort(log: any) {
  if (!log.created) return; // keepalive

  let data: string;
  const obj = log.object;
  if (log.type === 'request') {
    data =
      `REQ "${obj.method} ${obj.uri} ${obj.protocol}"` +
      ` ${obj.remoteAddr} - ${obj.remoteUser || ''}` +
      ` "${obj.referer || ''}" "${obj.userAgent || ''}"`;
  } else if (log.type === 'response') {
    data =
      `RES "${obj.method} ${obj.uri} ${obj.protocol}"` +
      ` ${obj.status} ${obj.bodyBytesSent}`;
  } else if (log.type === 'event') {
    data = `EVENT ${log.event} ${JSON.stringify(log.payload)}`;
  } else if (obj) {
    data = JSON.stringify(obj, null, 2);
  } else {
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
  }

  const date = new Date(log.created).toISOString();

  data.split('\n').forEach(line => {
    if (
      line.includes('START RequestId:') ||
      line.includes('END RequestId:') ||
      line.includes('XRAY TraceId:')
    ) {
      return;
    }

    if (line.includes('REPORT RequestId:')) {
      line = line.substring(line.indexOf('Duration:'), line.length);

      if (line.includes('Init Duration:')) {
        line = line.substring(0, line.indexOf('Init Duration:'));
      }
    }

    console.log(
      `${chalk.dim(date)}  ${line.replace('[now-builder-debug] ', '')}`
    );
  });

  return 0;
}

function printLogRaw(log: any) {
  if (!log.created) return; // keepalive

  if (log.object) {
    console.log(log.object);
  } else if (typeof log.text === 'string') {
    console.log(
      log.text
        .replace(/\n$/, '')
        .replace(/^\n/, '')
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[1000D/g, '')
        .replace(/\x1b\[0K/g, '')
        .replace(/\x1b\[1A/g, '')
    );
  }

  return 0;
}

const logPrinters = {
  short: printLogShort,
  raw: printLogRaw,
};

type OutputMode = keyof typeof logPrinters;

const isLogPrinter = (v: any): v is OutputMode => {
  return v && v in logPrinters;
};

const getLogPrinter = (mode: string | undefined, def: OutputMode) => {
  if (mode) {
    if (isLogPrinter(mode)) {
      return logPrinters[mode];
    }
    throw new TypeError(
      `Invalid output mode "${mode}". Must be one of: ${Object.keys(
        logPrinters
      ).join(', ')}`
    );
  }
  return logPrinters[def];
};

function toTimestamp(datestr: string) {
  const t = Date.parse(datestr);
  if (isNaN(t)) {
    throw new TypeError('Invalid date string');
  }
  return t;
}
