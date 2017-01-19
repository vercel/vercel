#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const ms = require('ms')

// Ours
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const {error} = require('../lib/error')
const NowCreditCards = require('../lib/credit-cards')
const indent = require('../lib/indent')

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

const subcommand = argv._[0]

const help = () => {
  console.log(`
  ${chalk.bold('𝚫 now cc')} <ls | add | rm | set-default>

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -f, --force             Skip DNS verification
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Lists all your credit cards:

      ${chalk.cyan('$ now cc ls')}

  ${chalk.gray('–')} Adds a credit card (interactively):

      ${chalk.cyan(`$ now cc add`)}

  ${chalk.gray('–')} Removes a credit card:

      ${chalk.cyan(`$ now cc rm <id>`)}

      ${chalk.gray('–')} If the id is ommitted, you can choose interactively

  ${chalk.gray('–')} Selects your default credit card:

      ${chalk.cyan(`$ now cc set-default <id>`)}

      ${chalk.gray('–')} If the id is ommitted, you can choose interactively
  `)
}

// options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

const exit = code => {
  // we give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  setTimeout(() => process.exit(code || 0), 100)
}

if (argv.help || !subcommand) {
  help()
  exit(0)
} else {
  const config = cfg.read()

  Promise.resolve(argv.token || config.token || login(apiUrl))
  .then(async token => {
    try {
      await run(token)
    } catch (err) {
      if (err.userError) {
        error(err.message)
      } else {
        error(`Unknown error: ${err.stack}`)
      }
      exit(1)
    }
  })
  .catch(e => {
    error(`Authentication error – ${e.message}`)
    exit(1)
  })
}

async function run(token) {
  const start = new Date()
  const creditCards = new NowCreditCards(apiUrl, token, {debug})

  switch (subcommand) {
    case 'ls':
    case 'list': {
      const cards = await creditCards.ls()
      const text = cards.cards.map(card => {
        const _default = card.id === cards.defaultCardId ? ' ' + chalk.bold('(default)') : ''
        const id = `${chalk.gray('-')} ${chalk.cyan(`ID: ${card.id}`)}${_default}`
        const number = `${chalk.gray('#### ').repeat(3)}${card.last4}`
        let address = card.address_line1

        if (card.address_line2) {
          address += `, ${card.address_line2}.`
        } else {
          address += '.'
        }

        address += `\n${card.address_city}, `

        if (card.address_state) {
          address += `${card.address_state}, `
        }

        // TODO: Stripe is returning a two digit code for the country,
        // but we want the full country name
        address += `${card.address_zip}. ${card.address_country}`

        return [
          id,
          indent(card.name, 2),
          indent(`${card.brand} ${number}`, 2),
          indent(address, 2)
        ].join('\n')
      }).join('\n\n')

      const elapsed = ms(new Date() - start)
      console.log(`> ${cards.cards.length} card${cards.cards.length === 1 ? '' : 's'} found ${chalk.gray(`[${elapsed}]`)}`)
      if (text) {
        console.log(`\n${text}\n`)
      }

      break
    }

    default:
      error('Please specify a valid subcommand: ls | add | rm | set-default')
      help()
      exit(1)
  }

  creditCards.close()
}
