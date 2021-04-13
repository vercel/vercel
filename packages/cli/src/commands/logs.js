import chalk from 'chalk';
import Now from '../util';
import logo from '../util/output/logo';
import elapsed from '../util/output/elapsed.ts';
import { maybeURL, normalizeURL } from '../util/url';
import printEvents from '../util/events';
import getScope from '../util/get-scope.ts';
import { getPkgName } from '../util/pkg-name.ts';
import getArgs from '../util/get-args.ts';
import handleError from '../util/handle-error.ts';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} logs`)} <url|deploymentId>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -f, --follow                   Wait for additional data [off]
    -n ${chalk.bold.underline(
      'NUMBER'
    )}                      Number of logs [100]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    --since=${chalk.bold.underline(
      'SINCE'
    )}                  Only return logs after date (ISO 8601)
    --until=${chalk.bold.underline(
      'UNTIL'
    )}                  Only return logs before date (ISO 8601), ignored for ${'`-f`'}
    -S, --scope                    Set a custom scope
    -o ${chalk.bold.underline('MODE')}, --output=${chalk.bold.underline(
    'MODE'
  )}         Specify the output format (${Object.keys(logPrinters).join(
    '|'
  )}) [short]

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Print the logs for the deployment ${chalk.dim(
    '`deploymentId`'
  )}

    ${chalk.cyan(`$ ${getPkgName()} logs deploymentId`)}
`);
};

export default async function main(client) {
  let argv;
  let deploymentIdOrURL;

  let debug;
  let head;
  let limit;
  let follow;
  let outputMode;

  let since;
  let until;

  try {
    argv = getArgs(client.argv.slice(2), {
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
  } catch (error) {
    handleError(error);
    return 1;
  }

  argv._ = argv._.slice(1);
  deploymentIdOrURL = argv._[0];

  if (argv['--help'] || !deploymentIdOrURL || deploymentIdOrURL === 'help') {
    help();
    return 2;
  }

  const {
    authConfig: { token },
    apiUrl,
    output,
    config,
  } = client;

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

  debug = argv['--debug'];

  head = argv['--head'];
  limit = argv['--limit'] || 100;
  follow = argv['--follow'];
  if (follow) until = 0;
  outputMode = argv['--output'] in logPrinters ? argv['--output'] : 'short';

  const { currentTeam } = config;
  const now = new Now({ apiUrl, token, debug, currentTeam, output });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  let deployment;
  const id = deploymentIdOrURL;

  const depFetchStart = Date.now();
  output.spinner(`Fetching deployment "${id}" in ${chalk.bold(contextName)}`);

  try {
    deployment = await now.findDeployment(id);
  } catch (err) {
    output.stopSpinner();
    now.close();

    if (err.status === 404) {
      output.error(
        `Failed to find deployment "${id}" in ${chalk.bold(contextName)}`
      );
      return 1;
    }
    if (err.status === 403) {
      output.error(
        `No permission to access deployment "${id}" in ${chalk.bold(
          contextName
        )}`
      );
      return 1;
    }
    // unexpected
    throw err;
  }

  output.log(
    `Fetched deployment "${deployment.url}" in ${chalk.bold(
      contextName
    )} ${elapsed(Date.now() - depFetchStart)}`
  );

  let direction = head ? 'forward' : 'backward';
  if (since && !until) direction = 'forward';
  const findOpts1 = {
    direction,
    limit,
    since,
    until,
  }; // no follow
  const storage = [];
  const storeEvent = event => storage.push(event);

  await printEvents(now, deployment.uid || deployment.id, currentTeam, {
    mode: 'logs',
    onEvent: storeEvent,
    quiet: false,
    debug,
    findOpts: findOpts1,
    output,
  });

  const printedEventIds = new Set();
  const printEvent = event => {
    if (printedEventIds.has(event.id)) return 0;
    printedEventIds.add(event.id);
    return logPrinters[outputMode](event);
  };
  storage.sort(compareEvents).forEach(printEvent);

  if (follow) {
    const lastEvent = storage[storage.length - 1];
    // NOTE: the API ignores `since` on follow mode.
    // (but not sure if it's always true on legacy deployments)
    const since2 = lastEvent ? lastEvent.date : Date.now();
    const findOpts2 = {
      direction: 'forward',
      since: since2,
      follow: true,
    };
    await printEvents(now, deployment.uid || deployment.id, currentTeam, {
      mode: 'logs',
      onEvent: printEvent,
      quiet: false,
      debug,
      findOpts: findOpts2,
      output,
    });
  }

  now.close();
  return 0;
}

function compareEvents(d1, d2) {
  const c1 = d1.date || d1.created;
  const c2 = d2.date || d2.created;
  if (c1 !== c2) return c1 - c2;
  const s1 = d1.serial || '';
  const s2 = d2.serial || '';
  const sc = s1.localeCompare(s2);
  if (sc !== 0) return sc;
  return d1.created - d2.created; // if date are equal and no serial
}

function printLogShort(log) {
  if (!log.created) return; // keepalive

  let data;
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

  data.split('\n').forEach((line, i) => {
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

    if (i === 0) {
      console.log(
        `${chalk.dim(date)}  ${line.replace('[now-builder-debug] ', '')}`
      );
    } else {
      console.log(
        `${' '.repeat(date.length)}  ${line.replace(
          '[now-builder-debug] ',
          ''
        )}`
      );
    }
  });

  return 0;
}

function printLogRaw(log) {
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

function toTimestamp(datestr) {
  const t = Date.parse(datestr);
  if (isNaN(t)) {
    throw new TypeError('Invalid date string');
  }
  return t;
}
