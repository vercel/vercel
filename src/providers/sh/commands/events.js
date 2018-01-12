// Packages
const qs = require('qs');
const mri = require('mri')
const chalk = require('chalk')
const promisepipe = require('promisepipe');
const jsonlines = require('jsonlines');
const through2 = require('through2');

// Utilities
const fetch = require('../util/fetch-auth');
const getConfig = require('../util/get-config');
const getAuthToken = require('../util/get-auth-token');
const getDeploymentByURL = require('../util/get-deployment-by-url');
const cmd = require('../../../util/output/cmd')
const logo = require('../../../util/output/logo')
const info = require('../../../util/output/info')
const error = require('../../../util/output/error')

const help = () => (
  `
  ${chalk.bold(`${logo} now events <url>`)}

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -f, --follow                   Listen on new events
    -n ${chalk.bold.underline('N')}, --number=${chalk.bold.underline('N')}                   Specify how many initial events to fetch [10]
    -H, --head                     Fetch events from the beginning

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Get the last 20 events

    ${chalk.cyan('$ now events my-deployment-url.now.sh')}

  ${chalk.gray('–')} Get the last 10 events and follow in realtime

    ${chalk.cyan('$ now events -n 10 -f my-alias.now.sh')}

  ${chalk.gray('–')} Get the first 10 events

    ${chalk.cyan('$ now events -n 10 --head my-deployment-url.now.sh')}

`
)

// Options
let argv

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug', 'follow', 'head'],
    number: ['number'],
    alias: {
      help: 'h',
      debug: 'd',
      follow: 'f',
      head: 'H',
      number: 'n'
    }
  })

  argv._ = argv._.slice(1)

  if (argv.help || argv._[0] === 'help') {
    console.error(help());
    return 2;
  }

  if (argv._.length !== 1) {
    console.error(error('Missing argument <url>'));
    console.error(info(`Usage: now events <url>. Run ${cmd('now events -h')} for help.`));
    return 2;
  }

  if (argv.head && argv.follow) {
    console.error(error(`The options ${cmd('--head')} and ${cmd('--follow')} cannot be used together`));
    return 2;
  }

  const token = getAuthToken(ctx);
  const {currentTeam} = getConfig(ctx);
  const {apiUrl} = ctx;

  const [url] = argv._;
  let deployment;
  
  try {
    deployment = await getDeploymentByURL(url, { apiUrl, token });
  } catch (err) {
    console.error(error(`An error occurred while retrieving the deployment by URL "${url}": ${err.message}`));
    return 1;
  }

  if (deployment === null) {
    console.error(error(`Could not find or was unauthorized to access deployment "${url}"`));
    return 1;
  }

  const eventsUrl = `${apiUrl}/v1/now/deployments/${deployment.id}/events?${
    qs.stringify({
      follow: argv.follow ? 1 : 0,
      teamId: currentTeam ? currentTeam.id : null,
      head: argv.head ? 1 : 0,
      limit: argv.number == null ? 20 : argv.number
    })
  }`;

  const res = await fetch(eventsUrl, token);
  const { isTTY } = process.stdout;

  if (isTTY) {
    await promisepipe(res.body, jsonlines.parse(), renderEventStream);
  } else {
    // do json over stdout if non-tty
    await promisepipe(res.body, process.stdout);
  }

  return 0;
}

const renderEvent = ev => {
  if (ev.error) {
    throw new Error(`Unexpected error event: ${ev.error.message}`);
  } else {
    console.log(`${chalk.gray(new Date(ev.created))} ${chalk.bold(ev.type)}`);
  }
};

const renderEventStream = through2.obj(renderEvent);

module.exports = main;
