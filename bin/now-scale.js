#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const isURL = require('is-url')
const minimist = require('minimist')
const ms = require('ms')
const printf = require('printf')
require('epipebomb')()
const supportsColor = require('supports-color')

// Ours
const cfg = require('../lib/cfg')
const { handleError, error } = require('../lib/error')
const NowScale = require('../lib/scale')
const login = require('../lib/login')
const exit = require('../lib/utils/exit')
const logo = require('../lib/utils/output/logo')
const info = require('../lib/scale-info')
const sort = require('../lib/sort-deployments');

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug'],
  alias: { help: 'h', config: 'c', debug: 'd', token: 't' }
})

let id = argv._[0]
const scaleArg = argv._[1]
const optionalScaleArg = argv._[2]

// Options
const help = () => {
  console.log(
    `
  ${chalk.bold(`${logo} now scale`)} ls
  ${chalk.bold(`${logo} now scale`)} <url>
  ${chalk.bold(`${logo} now scale`)} <url> <min> [max]

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Create an deployment with 3 instances, never sleeps:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 3')}

  ${chalk.gray('–')} Create an automatically scaling deployment:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 1 5')}

  ${chalk.gray('–')} Create an automatically scaling deployment without specifying max:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 1 auto')}

  ${chalk.gray('–')} Create an automatically scaling deployment without specifying min or max:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh auto')}

  ${chalk.gray('–')} Create an deployment that is always active and never "sleeps":

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 1')}
  `
  )
}

// Options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

if (argv.help) {
  help()
  exit(0)
} else {
  Promise.resolve().then(async () => {
    const config = await cfg.read({token: argv.token})

    let token
    try {
      token = config.token || (await login(apiUrl))
    } catch (err) {
      error(`Authentication error – ${err.message}`)
      exit(1)
    }

    try {
      await run({ token, config })
    } catch (err) {
      if (err.userError) {
        error(err.message)
      } else {
        error(`Unknown error: ${err}\n${err.stack}`)
      }
      exit(1)
    }
  })
}

function guessParams() {
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

function isHostNameOrId(str) {
  return (
    /(https?:\/\/)?((?:(?=[a-z0-9-]{1,63}\.)(?:xn--)?[a-z0-9]+(?:-[a-z0-9]+)*\.)+[a-z]{2,63})/.test(
      str
    ) || str.length === 28
  )
}

async function run({ token, config: { currentTeam } }) {
  const scale = new NowScale({ apiUrl, token, debug, currentTeam })
  const start = Date.now()

  if (id === 'ls') {
    await list(scale)
    process.exit(0)
  } else if (id === 'info') {
    await info(scale)
    process.exit(0)
  } else if (id && isHostNameOrId(id)) {
    // Normalize URL by removing slash from the end
    if (isURL(id) && id.slice(-1) === '/') {
      id = id.slice(0, -1)
    }
  } else {
    error('Please specify a deployment: now scale <id|url>')
    help()
    exit(1)
  }

  const deployments = await scale.list()

  const match = deployments.find(d => {
    // `url` should match the hostname of the deployment
    let u = id.replace(/^https:\/\//i, '')

    if (u.indexOf('.') === -1) {
      // `.now.sh` domain is implied if just the subdomain is given
      u += '.now.sh'
    }

    return d.uid === id || d.name === id || d.url === u
  })

  if (!match) {
    error(`Could not find any deployments matching ${id}`)
    return process.exit(1)
  }

  const { min, max } = guessParams()

  if (
    !(Number.isInteger(min) || min === 'auto') &&
    !(Number.isInteger(max) || max === 'auto')
  ) {
    help()
    return exit(1)
  }

  const {
    max: currentMax,
    min: currentMin,
    current: currentCurrent
  } = match.scale
  if (
    max === currentMax &&
    min === currentMin &&
    Number.isInteger(min) &&
    currentCurrent >= min &&
    Number.isInteger(max) &&
    currentCurrent <= max
  ) {
    console.log(`> Done`)
    return
  }

  if ((match.state === 'FROZEN' || match.scale.current === 0) && min > 0) {
    console.log(
      `> Deployment is currently in 0 replicas, preparing deployment for scaling...`
    )
    if (match.scale.max < 1) {
      await scale.setScale(match.uid, { min: 0, max: 1 })
    }
    await scale.unfreeze(match)
  }

  const { min: newMin, max: newMax } = await scale.setScale(match.uid, {
    min,
    max
  })

  const elapsed = ms(new Date() - start)

  const currentReplicas = match.scale.current
  const log = console.log
  log(`> ${chalk.cyan('Success!')} Configured scaling rules [${elapsed}]`)
  log()
  log(
    `${chalk.bold(match.url)} (${chalk.gray(currentReplicas)} ${chalk.gray('current')})`
  )
  log(printf('%6s %s', 'min', chalk.bold(newMin)))
  log(printf('%6s %s', 'max', chalk.bold(newMax)))
  log(printf('%6s %s', 'auto', chalk.bold(newMin === newMax ? '✖' : '✔')))
  log()
  await info(scale, match.url)

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

  const sorted = await sort([...apps]);

  const timeNow = new Date();
  const urlLength =
    deployments.reduce((acc, i) => {
      return Math.max(acc, (i.url && i.url.length) || 0)
    }, 0) + 5

  for (const app of sorted) {
    const depls = argv.all ? app[1] : app[1].slice(0, 5);
    console.log(
      `${chalk.bold(app[0])} ${chalk.gray('(' + depls.length + ' of ' + app[1].length + ' total)')}`
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
      if (instance.scale.current > 0) {
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
