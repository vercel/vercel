#!/usr/bin/env node
//@flow

// Packages
const arg = require('arg')
const chalk = require('chalk')
const ms = require('ms')
const printf = require('printf')
const plural = require('pluralize')
const supportsColor = require('supports-color')

// Utilities
const Now = require('../util')
const createOutput = require('../../../util/output')
const { handleError } = require('../util/error')
const logo = require('../../../util/output/logo')
const sort = require('../util/sort-deployments')
const wait = require('../../../util/output/wait')
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
    argv = arg(ctx.argv.slice(2), {
      ...argCommon,
      '--all': Boolean,
      '-a': '--all',
    })
  } catch (err) {
    handleError(err)
    return 1;
  }

  argv._ = argv._.slice(1)

  const debugEnabled = argv['--debug']
  const { log, error, debug } = createOutput({ debug: debugEnabled })

  if (argv._.length > 1) {
    error('`now ls [app]` accepts at most one argument');
    return 1;
  }

  const app = argv._[0]
  const apiUrl = ctx.apiUrl

  if (argv['--help']) {
    help()
    return 0
  }

  const stopSpinner = wait('Fetching deployments')

  const {authConfig: { credentials }, config: { sh, includeScheme }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { currentTeam, user } = sh;

  const now = new Now({ apiUrl, token, currentTeam })
  const start = new Date()

  if (argv['--all'] && !app) {
    stopSpinner()
    error('You must define an app when using `-a` / `--all`')
    return 1;
  }

  let deployments

  try {
    debug('Fetching deployments')
    deployments = await now.list(app, { version: 3 })
  } catch (err) {
    handleError(err)
    return 1;
  }

  if (!deployments || (Array.isArray(deployments) && deployments.length <= 0)) {
    debug('No deployments: attempting to find deployment that matches supplied app name')
    const match = await now.findDeployment(app)

    if (match !== null && typeof match !== 'undefined') {
      debug('Found deployment that matches app name');
      deployments = Array.of(match)
    }
  }

  if (!deployments || (Array.isArray(deployments) && deployments.length <= 0)) {
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

  const apps = new Map()

  if (argv['--all']) {
    await Promise.all(
      deployments.map(async ({ uid }, i) => {
        deployments[i].instances = await now.listInstances(uid)
      })
    )
  }

  for (const dep of deployments) {
    const deps = apps.get(dep.name) || []
    apps.set(dep.name, deps.concat(dep))
  }

  const sorted = await sort([...apps])

  const urlLength =
    deployments.reduce((acc, i) => {
      return Math.max(acc, (i.url && i.url.length) || 0)
    }, 0) + 5
  const timeNow = new Date()
  stopSpinner()
  log(
    `${
      plural('deployment', deployments.length, true)
    } found under ${chalk.bold(
      (currentTeam && currentTeam.slug) || user.username || user.email
    )} ${chalk.grey('[' + ms(timeNow - start) + ']')}`
  )

  let shouldShowAllInfo = false

  for (const app of apps) {
    shouldShowAllInfo =
      app[1].length > 5 ||
      app.find(depl => {
        // $FlowFixMe
        return depl.scale && depl.scale.current > 1
      })
    if (shouldShowAllInfo) {
      break
    }
  }

  if (!argv['--all'] && shouldShowAllInfo) {
    log(
      `To expand the list and see instances run ${chalk.cyan(
        '`now ls --all [app]`'
      )}`
    )
  }

  console.log()

  sorted.forEach(([name, deps]) => {
    const listedDeployments = argv['--all'] ? deps : deps.slice(0, 5)

    console.log(
      `${chalk.bold(name)} ${chalk.gray(
        '(' + listedDeployments.length + ' of ' + deps.length + ' total)'
      )}`
    )

    const urlSpec = `%-${urlLength}s`

    console.log(
      printf(
        ` ${chalk.grey(urlSpec + '  %8s    %-16s %8s')}`,
        'url',
        'inst #',
        'state',
        'age'
      )
    )

    listedDeployments.forEach(dep => {
      let state = dep.state
      let extraSpaceForState = 0

      if (state === null || typeof state === 'undefined') {
        state = 'DEPLOYMENT_ERROR'
      }

      if (/ERROR/.test(state)) {
        state = chalk.red(state)
        extraSpaceForState = 10
      } else if (state === 'FROZEN') {
        state = chalk.grey(state)
        extraSpaceForState = 10
      }

      let spec

      if (supportsColor) {
        spec = ` %-${urlLength + 10}s %8s    %-${extraSpaceForState + 16}s %8s`
      } else {
        spec = ` %-${urlLength + 1}s %8s    %-${16}s %8s`
      }

      console.log(
        printf(
          spec,
          chalk.underline((includeScheme ? 'https://' : '') + dep.url),
          dep.scale ? dep.scale.current : '✖',
          state,
          dep.created ? ms(timeNow - dep.created) : 'n/a'
        )
      )

      if (Array.isArray(dep.instances) && dep.instances.length > 0) {
        dep.instances.forEach(i => {
          console.log(
            printf(` %-${urlLength + 10}s`, ` - ${chalk.underline(i.url)}`)
          )
        })

        console.log()
      }
    })

    console.log()
  })
}
