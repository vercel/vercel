#!/usr/bin/env node

// Packages
const minimist = require('minimist')
const chalk = require('chalk')
const ms = require('ms')
const table = require('text-table')

// Ours
const Now = require('../lib')
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const { handleError, error } = require('../lib/error')
const logo = require('../lib/utils/output/logo')
const { normalizeURL } = require('../lib/utils/url')

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug', 'hard', 'yes', 'safe'],
  alias: {
    help: 'h',
    config: 'c',
    debug: 'd',
    token: 't',
    yes: 'y'
  }
})

const ids = argv._

// Options
const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} now remove`
  )} deploymentId|deploymentName [...deploymentId|deploymentName]

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline(
    'FILE'
  )}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )} Login token
    -y, --yes               Skip confirmation
    --safe                  Skip deployments with an active alias

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Remove a deployment identified by ${chalk.dim(
    '`deploymentId`'
  )}:

    ${chalk.cyan('$ now rm deploymentId')}

  ${chalk.gray('–')} Remove all deployments with name ${chalk.dim('`my-app`')}:

    ${chalk.cyan('$ now rm my-app')}

  ${chalk.gray('–')} Remove two deployments with IDs ${chalk.dim(
    '`eyWt6zuSdeus`'
  )} and ${chalk.dim('`uWHoA9RQ1d1o`')}:

    ${chalk.cyan('$ now rm eyWt6zuSdeus uWHoA9RQ1d1o')}

  ${chalk.dim('Alias:')} rm
`)
}

if (argv.help || ids.length === 0) {
  help()
  process.exit(0)
}

// Options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'
const hard = argv.hard || false
const skipConfirmation = argv.yes || false

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

Promise.resolve().then(async () => {
  const config = await cfg.read({ token: argv.token })

  let token
  try {
    token = config.token || login(apiUrl)
  } catch (err) {
    error(`Authentication error – ${err.message}`)
    process.exit(1)
  }

  try {
    await remove({ token, config })
  } catch (err) {
    error(`Unknown error: ${err}\n${err.stack}`)
    process.exit(1)
  }
})

function readConfirmation(matches) {
  return new Promise(resolve => {
    process.stdout.write(
      `> The following deployment${matches.length === 1
        ? ''
        : 's'} will be removed permanently:\n`
    )

    const tbl = table(
      matches.map(depl => {
        const time = chalk.gray(ms(new Date() - depl.created) + ' ago')
        const url = depl.url ? chalk.underline(`https://${depl.url}`) : ''
        return [depl.uid, url, time]
      }),
      { align: ['l', 'r', 'l'], hsep: ' '.repeat(6) }
    )
    process.stdout.write(tbl + '\n')

    for (const [index, depl] of matches.entries()) {
      for (const alias of depl.aliases) {
        if (argv.safe) {
          delete matches[index]
          continue
        }
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

async function remove({ token, config: { currentTeam } }) {
  const now = new Now({ apiUrl, token, debug, currentTeam })

  const deployments = await now.list()

  const matches = deployments.filter(d => {
    return ids.some(id => {
      return d.uid === id || d.name === id || d.url === normalizeURL(id)
    })
  })

  if (matches.length === 0) {
    error(
      `Could not find any deployments matching ${ids
        .map(id => chalk.bold(`"${id}"`))
        .join(', ')}. Run ${chalk.dim(`\`now ls\``)} to list.`
    )
    return process.exit(1)
  }

  const aliases = await Promise.all(
    matches.map(depl => now.listAliases(depl.uid))
  )
  for (let i = 0; i < matches.length; i++) {
    matches[i].aliases = aliases[i]
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
          return [`Deployment ${chalk.bold(depl.uid)} removed`]
        })
      )
    )
  } catch (err) {
    handleError(err)
    process.exit(1)
  }

  now.close()
}
