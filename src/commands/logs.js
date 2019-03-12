import mri from 'mri';
import chalk from 'chalk';
import Now from '../util';
import createOutput from '../util/output';
import logo from '../util/output/logo';
import elapsed from '../util/output/elapsed.ts';
import { maybeURL, normalizeURL, parseInstanceURL } from '../util/url';
import printEvents from '../util/events';
import wait from '../util/output/wait';
import Client from '../util/client.ts';
import getScope from '../util/get-scope.ts';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now logs`)} <url|deploymentId>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -a, --all                      Include access logs
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -f, --follow                   Wait for additional data [off]
    -n ${chalk.bold.underline(
      'NUMBER'
    )}                      Number of logs [100]
    -q ${chalk.bold.underline('QUERY')}, --query=${chalk.bold.underline(
    'QUERY'
  )}        Search query
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

    ${chalk.cyan('$ now logs deploymentId')}
`);
};

export default async function main(ctx) {
  let argv;
  let deploymentIdOrURL;

  let debug;
  let apiUrl;
  let head;
  let limit;
  let query;
  let follow;
  let types;
  let outputMode;

  let since;
  let until;
  let instanceId;

  argv = mri(ctx.argv.slice(2), {
    string: ['query', 'since', 'until', 'output'],
    boolean: ['help', 'all', 'debug', 'head', 'follow'],
    alias: {
      help: 'h',
      all: 'a',
      debug: 'd',
      query: 'q',
      follow: 'f',
      output: 'o'
    }
  });

  argv._ = argv._.slice(1);
  deploymentIdOrURL = argv._[0];

  if (argv.help || !deploymentIdOrURL || deploymentIdOrURL === 'help') {
    help();
    return 2;
  }

  const debugEnabled = argv.debug;
  const output = createOutput({ debug: debugEnabled });

  try {
    since = argv.since ? toTimestamp(argv.since) : 0;
  } catch (err) {
    output.error(`Invalid date string: ${argv.since}`);
    return 1;
  }

  try {
    until = argv.until ? toTimestamp(argv.until) : 0;
  } catch (err) {
    output.error(`Invalid date string: ${argv.until}`);
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

    [deploymentIdOrURL, instanceId] = parseInstanceURL(normalizedURL);
  }

  debug = argv.debug;
  apiUrl = ctx.apiUrl;

  head = argv.head;
  limit = typeof argv.n === 'number' ? argv.n : 100;
  query = argv.query || '';
  follow = argv.f;
  if (follow) until = 0;
  types = argv.all ? [] : ['command', 'stdout', 'stderr', 'exit'];
  outputMode = argv.output in logPrinters ? argv.output : 'short';

  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const now = new Now({ apiUrl, token, debug, currentTeam });
  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled
  });
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
  const cancelWait = wait(
    `Fetching deployment "${id}" in ${chalk.bold(contextName)}`
  );

  try {
    deployment = await now.findDeployment(id);
  } catch (err) {
    cancelWait();
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

  cancelWait();
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
    query,
    types,
    instanceId,
    since,
    until
  }; // no follow
  const storage = [];
  const storeEvent = event => storage.push(event);

  await printEvents(now, deployment.uid || deployment.id, currentTeam, {
    mode: 'logs',
    onEvent: storeEvent,
    quiet: false,
    debug,
    findOpts: findOpts1
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
      query,
      types,
      instanceId,
      since: since2,
      follow: true
    };
    await printEvents(now, deployment.uid || deployment.id, currentTeam, {
      mode: 'logs',
      onEvent: printEvent,
      quiet: false,
      debug,
      findOpts: findOpts2
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
  } else {
    data = obj
      ? JSON.stringify(obj, null, 2)
      : (log.text || '')
          .replace(/\n$/, '')
          .replace(/^\n/, '')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b\[1000D/g, '')
          .replace(/\x1b\[0K/g, '')
          .replace(/\x1b\[1A/g, '');
  }

  const date = new Date(log.created).toISOString();

  data.split('\n').forEach((line, i) => {
    if (i === 0) {
      console.log(`${chalk.dim(date)}  ${line}`);
    } else {
      console.log(`${' '.repeat(date.length)}  ${line}`);
    }
  });

  return 0;
}

function printLogRaw(log) {
  if (!log.created) return; // keepalive

  if (log.object) {
    console.log(log.object);
  } else {
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
  raw: printLogRaw
};

function toTimestamp(datestr) {
  const t = Date.parse(datestr);
  if (isNaN(t)) {
    throw new TypeError('Invalid date string');
  }
  return t;
}
