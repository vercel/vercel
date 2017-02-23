#!/usr/bin/env node

// Packages
const fs = require('fs-promise')
const minimist = require('minimist')
const chalk = require('chalk')
const opn = require('opn')

// Ours
const Now = require('../lib')
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const {handleError, error} = require('../lib/error')
const logo = require('../lib/utils/output/logo')

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug'],
  alias: {
    help: 'h',
    config: 'c',
    debug: 'd',
    token: 't'
  }
})

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now open`)}

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Open latest deployment for current project

    ${chalk.cyan('$ now open')}

`)
}

if (argv.help) {
  help()
  process.exit(0)
}

const app = argv._[0]

// options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

const config = cfg.read()

Promise.resolve(argv.token || config.token || login(apiUrl))
    .then(async token => {
      try {
        await open(token)
      } catch (err) {
        error(`Unknown error: ${err}\n${err.stack}`)
        process.exit(1)
      }
    })
    .catch(e => {
      error(`Authentication error – ${e.message}`)
      process.exit(1)
    })

async function open(token) {
  const now = new Now(apiUrl, token, {debug})

  let deployments
  try {
    deployments = await now.list(app)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }

  now.close()

  const apps = new Map()

  for (const dep of deployments) {
    const deps = apps.get(dep.name) || []
    apps.set(dep.name, deps.concat(dep))
  }

  let pkg
  try {
    const json = await fs.readFile('package.json')
    pkg = JSON.parse(json)
  } catch (err) {
    pkg = {}
  }

  const [currentProjectDeployments] = await getCurrentProjectDeployments([...apps], pkg)

  if (typeof currentProjectDeployments === 'undefined') {
    console.log(`no deployments found for ${chalk.bold(pkg.name)}`)
    process.exit(0)
  }

  const sorted = await sortByCreation([...currentProjectDeployments])
  const latestDeploy = sorted[0]

  try {
    const url = `https://${latestDeploy.url}`

    console.log(`Opening the latest deployment for ${chalk.bold(pkg.name)}...`)
    console.log(`Here's the URL: ${chalk.underline(url)}`)

    opn(url)
    process.exit(0)
  } catch (err) {
    error(`Unknown error: ${err}\n${err.stack}`)
    process.exit(1)
  }
}

async function getCurrentProjectDeployments(apps, pkg) {
  return apps
        .filter(app => pkg.name === app[0])
        .map(app => app[1])
}

async function sortByCreation(deps) {
  return deps
        .sort((depA, depB) => {
          return depB.created - depA.created
        })
}
