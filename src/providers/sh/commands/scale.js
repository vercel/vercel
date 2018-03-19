#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const mri = require('mri')

// Utilities
const { handleError, error } = require('../util/error')
const NowScale = require('../util/scale')
const exit = require('../../../util/exit')
const logo = require('../../../util/output/logo')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now scale`)} <url> <min> [max]

  ${chalk.dim('Commands:')}

    ls    List the scaling information for all deployments

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

  ${chalk.gray('–')} Scale a deployment to 3 instances (never sleeps)

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 3')}

  ${chalk.gray('–')} Set a deployment to scale automatically between 1 and 5 instances

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 1 5')}

  ${chalk.gray(
    '–'
  )} Set a deployment to scale until your plan limit, but at least 1 instance

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 1 auto')}

  ${chalk.gray(
    '–'
  )} Set a deployment to scale up and down without limits

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh auto')}
  `)
}

// Options
let argv
let debug
let apiUrl

let id // Deployment Id or URL
let dcs // Target DCs
let min = 1 // Minimum number of instances
let max = 'auto' // Maximum number of instances

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  })

  apiUrl = ctx.apiUrl
  debug = argv.debug

  argv._ = argv._.slice(1).map(arg => {
    return isNaN(arg) ? arg : parseInt(arg)
  })

  id = argv._[0]

  if (typeof !argv._[0] === 'string') {
    dcs = argv._[0].split(',')
    argv._.pop()
  }

  if (Number.isInteger(argv._1[0])) {
    min = Number(argv._[0])
  }
  if (Number.isInteger(argv._[1])) {
    max = Number(argv._[1])
  }

  if (argv.help) {
    help()
    await exit(0)
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')

  try {
    await run({ token, sh })
  } catch (err) {
    if (err.userError) {
      console.error(error(err.message))
    } else {
      console.error(error(`Unknown error: ${err}\n${err.stack}`))
    }

    exit(1)
  }
}

module.exports = async ctx => {
  try {
    await main(ctx)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }
}

async function run({ token, sh: { currentTeam } }) {
  const scale = new NowScale({ apiUrl, token, debug, currentTeam })

  if (id === 'ls') {
    console.error(error(`\`now scale ls\` has been deprecated. Use \`now ls\` and \`now inspect <url>\``))
    process.exit(1)
  } else if (!id) {
    console.error(error('Please specify a deployment: now scale <url> [dc] <min> [max]'))
    help()
    exit(1)
  }

  const deployment = await scale.findDeployment(id)

  if (
    !(Number.isInteger(min) || min === 'auto') &&
    !(Number.isInteger(max) || max === 'auto')
  ) {
    help()
    return exit(1)
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

process.on('uncaughtException', err => {
  handleError(err)
  exit(1)
})
