#!/usr/bin/env node
//@flow

// Packages
const arg = require('arg')
const chalk = require('chalk')
const ms = require('ms')
const plural = require('pluralize')
const table = require('text-table')

// Utilities
const Now = require('../util')
const createOutput = require('../../../util/output')
const { handleError } = require('../util/error')
const cmd = require('../../../util/output/cmd')
const logo = require('../../../util/output/logo')
const elapsed = require('../../../util/output/elapsed')
const wait = require('../../../util/output/wait')
const strlen = require('../util/strlen')
const getContextName = require('../util/get-context-name')
const toHost = require('../util/to-host')
const argCommon = require('../util/arg-common')()

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now list`)} [app]

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
    -T, --team                     Set a custom team scope
    -a, --all                      See all instances for each deployment (requires [app])

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List all deployments

    ${chalk.cyan('$ now ls')}

  ${chalk.gray('–')} List all deployments for the app ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now ls my-app')}

  ${chalk.gray('–')} List all deployments and all instances for the app ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now ls my-app --all')}
`)
}

// Options
// $FlowFixMe
module.exports = async function main(ctx) {
  let argv

  try {
    argv = arg(ctx.argv.slice(3), {
      ...argCommon,
      '--all': Boolean,
      '-a': '--all',
    })
  } catch (err) {
    handleError(err)
    return 1;
  }

  const debugEnabled = argv['--debug']
  const { print, log, error, note, debug } = createOutput({ debug: debugEnabled })

  if (argv._.length > 1) {
    error(`${cmd('now ls [app]')} accepts at most one argument`);
    return 1;
  }

  let app = argv._[0]
  let host = null

  const apiUrl = ctx.apiUrl

  if (argv['--help']) {
    help()
    return 0
  }

  const {authConfig: { credentials }, config: { sh, includeScheme }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { currentTeam } = sh;
  const contextName = getContextName(sh);

  const stopSpinner = wait(`Fetching deployments in ${chalk.bold(contextName)}`)

  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })
  const start = new Date()

  if (argv['--all'] && !app) {
    error('You must define an app when using `-a` / `--all`')
    return 1;
  }

  // Some people are using entire domains as app names, so
  // we need to account for this here
  if (app && toHost(app).endsWith('.now.sh')) {
    note('We suggest using `now inspect <deployment>` for retrieving details about a single deployment')

    const asHost = toHost(app)
    const hostParts = asHost.split('-')

    if (hostParts < 2) {
      stopSpinner()
      error('Only deployment hostnames are allowed, no aliases')
      return 1
    }

    app = null
    host = asHost
  }

  let deployments

  try {
    debug('Fetching deployments')
    deployments = await now.list(app, { version: 3 })
  } catch (err) {
    stopSpinner();
    throw err;
  }

  if (app && !deployments.length) {
    debug('No deployments: attempting to find deployment that matches supplied app name')
    let match

    try {
      await now.findDeployment(app)
    } catch (err) {
      if (err.status === 404) {
        debug('Ignore findDeployment 404')
      } else {
        stopSpinner();
        throw err;
      }
    }

    if (match !== null && typeof match !== 'undefined') {
      debug('Found deployment that matches app name');
      deployments = Array.of(match)
    }
  }

  if (app && !deployments.length) {
    debug('No deployments: attempting to find aliases that matches supplied app name')
    const aliases = await now.listAliases()
    const item = aliases.find(e => e.uid === app || e.alias === app)

    if (item) {
      debug('Found alias that matches app name');
      const match = await now.findDeployment(item.deploymentId)

      if (match !== null && typeof match !== 'undefined') {
        deployments = Array.of(match)
      }
    }
  }

  now.close()

  if (argv['--all']) {
    await Promise.all(
      deployments.map(async ({ uid, instanceCount }, i) => {
        deployments[i].instances = instanceCount > 0
          ? await now.listInstances(uid)
          : []
      })
    )
  }

  if (host) {
    deployments = deployments.filter(deployment => {
      return deployment.url === host
    })
  }

  stopSpinner()
  log(
    `${
      plural('total deployment', deployments.length, true)
    } found under ${chalk.bold(contextName)} ${elapsed(Date.now() - start)}`
  )

  // we don't output the table headers if we have no deployments
  if (!deployments.length) {
    return 0;
  }

  // information to help the user find other deployments or instances
  if (app == null) {
    log(`To list more deployments for an app run ${cmd('now ls [app]')}`)
  } else if (!argv['--all']) {
    log(`To list deployment instances run ${cmd('now ls --all [app]')}`)
  }

  print('\n')

  console.log(table([
    ['app', 'url', 'inst #', 'type', 'state', 'age'].map(s => chalk.dim(s)),
    ...deployments
    .sort(sortRecent())
    .map(dep => (
      [
        [
          dep.name,
          chalk.bold((includeScheme ? 'https://' : '') + dep.url),
          dep.type === 'BINARY' || dep.instanceCount == null ? chalk.gray('-') : dep.instanceCount,
          dep.type,
          stateString(dep.state),
          chalk.gray(ms(Date.now() - new Date(dep.created)))
        ],
        ...(argv['--all']
          ? dep.instances.map(
              (i) => [
                '',
                ` ${chalk.gray('-')} ${i.url} `,
                '',
                '',
                ''
              ]
            )
          : []
        )
      ]
    ))
    // flatten since the previous step returns a nested
    // array of the deployment and (optionally) its instances
    .reduce((ac, c) => ac.concat(c), [])
    .filter(
      app == null
        // if an app wasn't supplied to filter by,
        // we only want to render one deployment per app
        ? filterUniqueApps()
        : () => true
    )
  ], {
    align: ['l','l','r','l','b'],
    hsep: ' '.repeat(4),
    stringLength: strlen
  }).replace(/^/gm, '  ') + '\n\n')
}

// renders the state string
function stateString(s: string) {
  switch (s) {
    case 'INITIALIZING':
      return chalk.yellow(s);

    case 'ERROR':
      return chalk.red(s);

    case 'READY':
      return s;

    default:
      return chalk.gray('UNKNOWN')
  }
}

// sorts by most recent deployment
function sortRecent() {
  return function recencySort(a, b) {
    return b.created - a.created;
  }
}

// filters only one deployment per app, so that
// the user doesn't see so many deployments at once.
// this mode can be bypassed by supplying an app name
function filterUniqueApps() {
  const uniqueApps = new Set()
  return function uniqueAppFilter([appName]) {
    if (uniqueApps.has(appName)) {
      return false;
    } else {
      uniqueApps.add(appName);
      return true;
    }
  }
}
