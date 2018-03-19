#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const arg = require('mri')

// Utilities
const { handleError } = require('../util/error')
const cmd = require('../../../util/output/cmd')
const createOutput = require('../../../util/output')
const NowScale = require('../util/scale')
const logo = require('../../../util/output/logo')
const argCommon = require('../util/arg-common')()

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now scale`)} <url> <dc> [min] [max]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -d, --debug                    Debug mode [off]
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Enable your deployment in all datacenters (min: 0, max: 1)

    ${chalk.cyan('$ now scale my-deployment-123.now.sh all')}

  ${chalk.gray('-')} Enable your deployment in the SFO datacenter (min: 0, max: 1)

    ${chalk.cyan('$ now scale my-deployment-123.now.sh sfo')}

  ${chalk.gray('–')} Scale a deployment in all datacenters to 3 instances at all times (no sleep)

    ${chalk.cyan('$ now scale my-deployment-123.now.sh all 3')}

  ${chalk.gray('–')} Enable your deployment in all datacenters, with auto-scaling

    ${chalk.cyan('$ now scale my-deployment-123.now.sh all auto')}
  `)
}

module.exports = async function main (ctx) {
  let id // Deployment Id or URL
  let dcs // Target DCs
  let min = 1 // Minimum number of instances
  let max = 'auto' // Maximum number of instances

  let argv;

  try {
    argv = arg(ctx.argv.slice(2), argCommon)
  } catch (err) {
    handleError(err)
    return 1;
  }

  argv._ = argv._.slice(1)

  const debugEnabled = argv['--debug']
  const { error, debug } = createOutput({ debug: debugEnabled })

  if (argv._.length < 2) {
    error(`${cmd('now scale <dc> <url> [min] [max]')} expects at least two arguments`)
    help();
    return 1;
  }

  const apiUrl = ctx.apiUrl

  argv._ = argv._.map(arg => {
    return isNaN(arg) ? arg : parseInt(arg)
  })

  id = argv._[0]

  if (id === 'ls') {
    error(`${cmd('now scale ls')} has been deprecated. Use ${cmd('now ls')} and ${cmd('now inspect <url>')}`, 'scale-ls')
    return 1
  }

  if (typeof !argv._[0] === 'string') {
    dcs = argv._[0].split(',')
    argv._.pop()
  }

  if (Number.isInteger(argv._[0])) {
    min = Number(argv._[0])
  }
  if (Number.isInteger(argv._[1])) {
    max = Number(argv._[1])
  }

  if (argv.help) {
    help()
    return 2;
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { currentTeam } = sh;

  const scale = new NowScale({ apiUrl, token, debug, currentTeam })

  const deployment = await scale.findDeployment(id)

  if (
    !(Number.isInteger(min) || min === 'auto') &&
    !(Number.isInteger(max) || max === 'auto')
  ) {
    help()
    return 1
  }

  const scaleArgs = {}
  for (const dc of dcs) {
    scaleArgs[dc] = {
      min,
      max
    }
  }

  await scale.setScale(deployment.uid, scaleArgs)

  scale.close()
}
