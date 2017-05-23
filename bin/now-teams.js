#!/usr/bin/env node

// Native
const { resolve } = require('path')

// Packages
const chalk = require('chalk')
const minimist = require('minimist')

// Ours
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const error = require('../lib/utils/output/error')
const NowTeams = require('../lib/teams')
const logo = require('../lib/utils/output/logo')
const exit = require('../lib/utils/exit')

const argv = minimist(process.argv.slice(2), {
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

const subcommand = argv._[0]

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now teams`)} <add | ls | rm | invite>

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new team:

      ${chalk.cyan('$ now teams add')}

  ${chalk.gray('–')} Switch to a team:

      ${chalk.cyan(`$ now switch <id>`)}

      ${chalk.gray('–')} If the id is omitted, you can choose interactively

      ${chalk.yellow('NOTE:')} When you switch, everything you add, list or remove will be scoped that team!

  ${chalk.gray('–')} Invite new members (interactively):

      ${chalk.cyan(`$ now teams invite`)}

  ${chalk.gray('–')} Invite a specific email:

      ${chalk.cyan(`$ now teams invite geist@zeit.co`)}

  ${chalk.gray('–')} Remove a team:

      ${chalk.cyan(`$ now teams rm <id>`)}

      ${chalk.gray('–')} If the id is omitted, you can choose interactively
  `)
}

// Options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

if (argv.help || !subcommand) {
  help()
  exit(0)
} else {
  Promise.resolve().then(async () => {
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
  })
}

async function run({ token, config: { currentTeam } }) {
  const teams = new NowTeams({ apiUrl, token, debug, currentTeam })
  const args = argv._.slice(1)

  switch (subcommand) {
    case 'list':
    case 'ls': {
      await require(resolve(__dirname, 'teams', 'list.js'))({
        teams,
        token
      })
      break
    }
    case 'switch':
    case 'change': {
      await require(resolve(__dirname, 'teams', 'switch.js'))({
        teams,
        args,
        token
      })
      break
    }
    case 'add':
    case 'create': {
      await require(resolve(__dirname, 'teams', 'add.js'))({ teams, token })
      break
    }

    case 'invite': {
      await require(resolve(__dirname, 'teams', 'invite.js'))({
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
