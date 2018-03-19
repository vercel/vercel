#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const mri = require('mri')
const ms = require('ms')
const printf = require('printf')
const supportsColor = require('supports-color')

// Utilities
const { handleError, error } = require('../util/error')
const NowScale = require('../util/scale')
const exit = require('../../../util/exit')
const logo = require('../../../util/output/logo')
const info = require('../util/scale-info')

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

let id
let scaleArg
let optionalScaleArg

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  })

  argv._ = argv._.slice(1).map(arg => {
    return isNaN(arg) ? arg : parseInt(arg)
  })

  id = argv._[0]
  scaleArg = argv._[1]
  optionalScaleArg = argv._[2]
  apiUrl = ctx.apiUrl
  debug = argv.debug

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

const guessParams = () => {
  if (Number.isInteger(scaleArg) && !optionalScaleArg) {
    return { min: scaleArg, max: scaleArg }
  } else if (Number.isInteger(scaleArg) && Number.isInteger(optionalScaleArg)) {
    return { min: scaleArg, max: optionalScaleArg }
  } else if (Number.isInteger(scaleArg) && optionalScaleArg === 'auto') {
    return { min: scaleArg, max: 'auto' }
  } else if (
    (!scaleArg && !optionalScaleArg) ||
    (scaleArg === 'auto' && !optionalScaleArg)
  ) {
    return { min: 1, max: 'auto' }
  }

  help()
  process.exit(1)
}

async function run({ token, sh: { currentTeam } }) {
  const scale = new NowScale({ apiUrl, token, debug, currentTeam })

  if (id === 'ls') {
    await list(scale)
    process.exit(0)
  } else if (!id) {
    console.error(error('Please specify a deployment: now scale <url> <min> [max]'))
    help()
    exit(1)
  }

  const deployment = await scale.findDeployment(id)
  const { min, max } = guessParams()
  // TODO parametrize
  const dc = 'sfo1'

  if (
    !(Number.isInteger(min) || min === 'auto') &&
    !(Number.isInteger(max) || max === 'auto')
  ) {
    help()
    return exit(1)
  }

  console.log(await scale.setScale(deployment.uid, {
    [dc]: {
      min,
      max
    }
  }))

  await info(scale, deployment.host)

  scale.close()
}

async function list(scale) {
  let deployments
  try {
    const app = argv._[1]
    deployments = await scale.list(app)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }

  scale.close()

  const apps = new Map()

  for (const dep of deployments) {
    const deps = apps.get(dep.name) || []
    apps.set(dep.name, deps.concat(dep))
  }

  const timeNow = new Date()
  const urlLength =
    deployments.reduce((acc, i) => {
      return Math.max(acc, (i.url && i.url.length) || 0)
    }, 0) + 5

  for (const app of apps) {
    const depls = argv.all ? app[1] : app[1].slice(0, 5)
    console.log(
      `${chalk.bold(app[0])} ${chalk.gray(
        '(' + depls.length + ' of ' + app[1].length + ' total)'
      )}`
    )
    console.log()
    const urlSpec = `%-${urlLength}s`
    console.log(
      printf(
        ` ${chalk.grey(urlSpec + '  %8s %8s %8s %8s %8s')}`,
        'url',
        'cur',
        'min',
        'max',
        'auto',
        'age'
      )
    )
    for (const instance of depls) {
      if (!instance.scale) {
        let spec
        if (supportsColor) {
          spec = ` %-${urlLength + 10}s %8s %8s %8s %8s %8s`
        } else {
          spec = ` %-${urlLength + 1}s %8s %8s %8s %8s %8s`
        }
        const infinite = '∞'
        console.log(
          printf(
            spec,
            chalk.underline(instance.url),
            infinite,
            1,
            infinite,
            '✔',
            ms(timeNow - instance.created)
          )
        )
      } else if (instance.scale.current > 0) {
        let spec
        if (supportsColor) {
          spec = ` %-${urlLength + 10}s %8s %8s %8s %8s %8s`
        } else {
          spec = ` %-${urlLength + 1}s %8s %8s %8s %8s %8s`
        }
        console.log(
          printf(
            spec,
            chalk.underline(instance.url),
            instance.scale.current,
            instance.scale.min,
            instance.scale.max,
            instance.scale.max === instance.scale.min ? '✖' : '✔',
            ms(timeNow - instance.created)
          )
        )
      } else {
        let spec
        if (supportsColor) {
          spec = ` %-${urlLength + 10}s ${chalk.gray('%8s %8s %8s %8s %8s')}`
        } else {
          spec = ` %-${urlLength + 1}s ${chalk.gray('%8s %8s %8s %8s %8s')}`
        }
        console.log(
          printf(
            spec,
            chalk.underline(instance.url),
            instance.scale.current,
            instance.scale.min,
            instance.scale.max,
            instance.scale.max === instance.scale.min ? '✖' : '✔',
            ms(timeNow - instance.created)
          )
        )
      }
    }
    console.log()
  }
}

process.on('uncaughtException', err => {
  handleError(err)
  exit(1)
})
