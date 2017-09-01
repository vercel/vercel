#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')

// Utilities
const error = require('../util/etc/output/error')
const NowTeams = require('../util/teams')
const logo = require('../util/etc/output/logo')
const exit = require('../util/etc/exit')
const { handleError } = require('../util/error')
const list = require('./teams/list')
const add = require('./teams/add')
const change = require('./teams/switch')
const invite = require('./teams/invite')
const getWelcome = require('../../../get-welcome')
const providers = require('../../')

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
    string: ['token'],
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd',
      token: 't',
      switch: 'change'
    }
  })

  if (!ctx.authConfig.credentials.length) {
    console.log(getWelcome('sh', providers))
    return 0
  }

  debug = argv.debug
  apiUrl = argv.url || 'https://api.zeit.co'

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

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = argv.token || credentials.find(item => item.provider === 'sh')

  try {
    await run({ token, sh })
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

async function run({ token, sh: { currentTeam } }) {
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
