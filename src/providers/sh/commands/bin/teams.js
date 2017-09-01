#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')

// Utilities
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const error = require('../lib/utils/output/error')
const NowTeams = require('../lib/teams')
const logo = require('../lib/utils/output/logo')
const exit = require('../lib/utils/exit')
const { handleError } = require('../lib/error')
const list = require('./teams/list')
const add = require('./teams/add')
const change = require('./teams/switch')
const invite = require('./teams/invite')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now teams`)} <add | ls | rm | invite>

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline(
    'FILE'
  )}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new team:

      ${chalk.cyan('$ now teams add')}

  ${chalk.gray('–')} Switch to a team:

      ${chalk.cyan(`$ now switch <slug>`)}

      ${chalk.gray(
        '–'
      )} If your team's url is 'zeit.co/teams/name', 'name' is the slug
      ${chalk.gray('–')} If the slug is omitted, you can choose interactively

      ${chalk.yellow(
        'NOTE:'
      )} When you switch, everything you add, list or remove will be scoped that team!

  ${chalk.gray('–')} Invite new members (interactively):

      ${chalk.cyan(`$ now teams invite`)}

  ${chalk.gray('–')} Invite a specific email:

      ${chalk.cyan(`$ now teams invite geist@zeit.co`)}

  ${chalk.gray('–')} Remove a team:

      ${chalk.cyan(`$ now teams rm <id>`)}

      ${chalk.gray('–')} If the id is omitted, you can choose interactively
  `)
}

let argv
let debug
let apiUrl
let subcommand

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    string: ['config', 'token'],
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      config: 'c',
      debug: 'd',
      token: 't',
      switch: 'change'
    }
  })

  debug = argv.debug
  apiUrl = argv.url || 'https://api.zeit.co'

  if (argv.config) {
    cfg.setConfigFile(argv.config)
  }

  const isSwitch = argv._[0] && argv._[0] === 'switch'

  argv._ = argv._.slice(1)
  subcommand = argv._[0]

  if (isSwitch) {
    subcommand = 'switch'
  }

  if (argv.help || !subcommand) {
    help()
    exit(0)
  }

  const config = await cfg.read({ token: argv.token })
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
      error(`Unknown error: ${err.stack}`)
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

async function run({ token, config: { currentTeam } }) {
  const teams = new NowTeams({ apiUrl, token, debug, currentTeam })
  const args = argv._

  switch (subcommand) {
    case 'list':
    case 'ls': {
      await list({
        teams,
        token
      })
      break
    }
    case 'switch':
    case 'change': {
      await change({
        teams,
        args,
        token
      })
      break
    }
    case 'add':
    case 'create': {
      await add({ teams, token })
      break
    }

    case 'invite': {
      await invite({
        teams,
        args,
        token
      })
      break
    }

    default: {
      let code = 0
      if (subcommand !== 'help') {
        error('Please specify a valid subcommand: ls | add | rm | set-default')
        code = 1
      }
      help()
      exit(code)
    }
  }
}
