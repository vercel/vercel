#!/usr/bin/env node

// Packages
const minimist = require('minimist')
const chalk = require('chalk')

// Ours
const cfg = require('../lib/cfg')
const exit = require('../lib/utils/exit')
const cmd = require('../lib/utils/output/cmd')
const logo = require('../lib/utils/output/logo')
const { handleError } = require('../lib/error')

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug', 'all'],
  alias: {
    help: 'h',
    config: 'c',
    debug: 'd',
    token: 't'
  }
})

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now whoami`)}

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

  ${chalk.gray('–')} Show the current team context

    ${chalk.cyan('$ now whoami')}
`)
}

if (argv.help) {
  help()
  process.exit(0)
}

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

async function whoami() {
  const config = await cfg.read({ token: argv.token })
  if (!config || !config.token) {
    console.log(
      `> Not currently logged in! Please run ${cmd('now --login')}.\n`
    )
    return exit(1)
  }

  if (process.stdout.isTTY) {
    process.stdout.write('> ')
  }

  const { user } = config
  const name = user.username || user.email
  console.log(name)
}

whoami().catch(err => {
  handleError(err)
  process.exit(1)
})
