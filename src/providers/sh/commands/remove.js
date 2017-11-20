#!/usr/bin/env node

// Packages
const mri = require('mri')
const chalk = require('chalk')
const ms = require('ms')
const plural = require('pluralize')
const table = require('text-table')

// Utilities
const Now = require('../util')
const { handleError, error } = require('../util/error')
const logo = require('../../../util/output/logo')
const info = require('../../../util/output/info')
const { normalizeURL } = require('../../../util/url')
const exit = require('../../../util/exit')

const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} now remove`
  )} [...deploymentId|deploymentName]

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
    -y, --yes                      Skip confirmation
    -s, --safe                     Skip deployments with an active alias
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Remove a deployment identified by ${chalk.dim(
    '`deploymentId`'
  )}

    ${chalk.cyan('$ now rm deploymentId')}

  ${chalk.gray('–')} Remove all deployments with name ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now rm my-app')}

  ${chalk.gray('–')} Remove two deployments with IDs ${chalk.dim(
    '`eyWt6zuSdeus`'
  )} and ${chalk.dim('`uWHoA9RQ1d1o`')}

    ${chalk.cyan('$ now rm eyWt6zuSdeus uWHoA9RQ1d1o')}
`)
}

// Options
let argv
let debug
let apiUrl
let hard
let skipConfirmation
let ids

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug', 'hard', 'yes', 'safe'],
    alias: {
      help: 'h',
      debug: 'd',
      yes: 'y',
      safe: 's'
    }
  })

  argv._ = argv._.slice(1)

  debug = argv.debug
  apiUrl = ctx.apiUrl
  hard = argv.hard || false
  skipConfirmation = argv.yes || false
  ids = argv._

  if (argv.help || ids.length === 0 || ids[0] === 'help') {
    help()
    await exit(0)
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')

  try {
    await remove({ token, sh })
  } catch (err) {
    console.error(error(`Unknown error: ${err}\n${err.stack}`))
    process.exit(1)
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

function readConfirmation(matches) {
  return new Promise(resolve => {
    console.log(info(
      `> The following ${
        plural('deployment', matches.length, true)
      } will be removed permanently:`
    ))

    const tbl = table(
      matches.map(depl => {
        const time = chalk.gray(ms(new Date() - depl.created) + ' ago')
        const url = depl.url ? chalk.underline(`https://${depl.url}`) : ''
        return [depl.uid, url, time]
      }),
      { align: ['l', 'r', 'l'], hsep: ' '.repeat(6) }
    )
    process.stdout.write(tbl + '\n')

    for (const depl of matches) {
      for (const alias of depl.aliases) {
        process.stdout.write(
          `> ${chalk.yellow('Warning!')} Deployment ${chalk.bold(depl.uid)} ` +
            `is an alias for ${chalk.underline(
              `https://${alias.alias}`
            )} and will be removed.\n`
        )
      }
    }

    process.stdout.write(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    )

    process.stdin
      .on('data', d => {
        process.stdin.pause()
        resolve(d.toString().trim())
      })
      .resume()
  })
}

async function remove({ token, sh: { currentTeam } }) {
  const now = new Now({ apiUrl, token, debug, currentTeam })

  const deployments = await now.list()

  let matches = deployments.filter(d => {
    return ids.some(id => {
      return d.uid === id || d.name === id || d.url === normalizeURL(id)
    })
  })

  const aliases = await Promise.all(
    matches.map(depl => now.listAliases(depl.uid))
  )

  matches = matches.filter((match, i) => {
    if (argv.safe && aliases[i].length > 0) {
      return false
    }

    match.aliases = aliases[i]
    return true
  })

  if (matches.length === 0) {
    console.log(info(
      `> Could not find ${argv.safe
        ? 'unaliased'
        : 'any'} deployments matching ${ids
        .map(id => chalk.bold(`"${id}"`))
        .join(', ')}. Run ${chalk.dim(`\`now ls\``)} to list.`
    ))
    return process.exit(0)
  }

  try {
    if (!skipConfirmation) {
      const confirmation = (await readConfirmation(matches)).toLowerCase()

      if (confirmation !== 'y' && confirmation !== 'yes') {
        console.log('\n> Aborted')
        process.exit(0)
      }
    }

    const start = new Date()

    await Promise.all(matches.map(depl => now.remove(depl.uid, { hard })))

    const elapsed = ms(new Date() - start)
    console.log(`${chalk.cyan('> Success!')} [${elapsed}]`)
    console.log(
      table(
        matches.map(depl => {
          return [info(`Deployment ${chalk.bold(depl.url)} removed`)]
        })
      )
    )
  } catch (err) {
    handleError(err)
    process.exit(1)
  }

  now.close()
}
