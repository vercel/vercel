#!/usr/bin/env node

// Packages
const minimist = require('minimist')
const chalk = require('chalk')

// Utilities
const logo = require('../../../util/output/logo')
const { handleError } = require('../util/error')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now whoami`)}

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

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Show the current team context

    ${chalk.cyan('$ now whoami')}
`)
}

// Options
let argv

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    boolean: ['help', 'debug', 'all'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  })

  argv._ = argv._.slice(1)

  if (argv.help || argv._[0] === 'help') {
    help()
    process.exit(0)
  }

  await whoami(ctx.config.sh)
}

module.exports = async ctx => {
  try {
    await main(ctx)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }
}

async function whoami({user}) {
  if (process.stdout.isTTY) {
    process.stdout.write('> ')
  }

  const name = user.username || user.email
  console.log(name)
}
