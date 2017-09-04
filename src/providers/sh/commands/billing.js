#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const ms = require('ms')

// Utilities
const { handleError, error } = require('../util/error')
const NowCreditCards = require('../util/credit-cards')
const indent = require('../util/indent')
const listInput = require('../../../util/input/list')
const success = require('../../../util/output/success')
const promptBool = require('../../../util/input/prompt-bool')
const info = require('../../../util/output/info')
const logo = require('../../../util/output/logo')
const addBilling = require('./billing/add')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now billing`)} <ls | add | rm | set-default>

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

  ${chalk.gray('–')} Lists all your credit cards:

      ${chalk.cyan('$ now billing ls')}

  ${chalk.gray('–')} Adds a credit card (interactively):

      ${chalk.cyan(`$ now billing add`)}

  ${chalk.gray('–')} Removes a credit card:

      ${chalk.cyan(`$ now billing rm <id>`)}

      ${chalk.gray('–')} If the id is omitted, you can choose interactively

  ${chalk.gray('–')} Selects your default credit card:

      ${chalk.cyan(`$ now billing set-default <id>`)}

      ${chalk.gray('–')} If the id is omitted, you can choose interactively
  `)
}

const exit = code => {
  // We give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  setTimeout(() => process.exit(code || 0), 100)
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
      token: 't'
    }
  })

  argv._ = argv._.slice(1)

  debug = argv.debug
  apiUrl = argv.url || 'https://api.zeit.co'
  subcommand = argv._[0]

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

// Builds a `choices` object that can be passesd to inquirer.prompt()
function buildInquirerChoices(cards) {
  return cards.cards.map(card => {
    const _default =
      card.id === cards.defaultCardId ? ' ' + chalk.bold('(default)') : ''
    const id = `${chalk.cyan(`ID: ${card.id}`)}${_default}`
    const number = `${chalk.gray('#### ').repeat(3)}${card.last4}`
    const str = [
      id,
      indent(card.name, 2),
      indent(`${card.brand} ${number}`, 2)
    ].join('\n')

    return {
      name: str, // Will be displayed by Inquirer
      value: card.id, // Will be used to identify the answer
      short: card.id // Will be displayed after the users answers
    }
  })
}

async function run({ token, sh: { currentTeam, user } }) {
  const start = new Date()
  const creditCards = new NowCreditCards({ apiUrl, token, debug, currentTeam })
  const args = argv._.slice(1)

  switch (subcommand) {
    case 'ls':
    case 'list': {
      let cards
      try {
        cards = await creditCards.ls()
      } catch (err) {
        error(err.message)
        return
      }
      const text = cards.cards
        .map(card => {
          const _default =
            card.id === cards.defaultCardId ? ' ' + chalk.bold('(default)') : ''
          const id = `${chalk.gray('-')} ${chalk.cyan(
            `ID: ${card.id}`
          )}${_default}`
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

          // Stripe is returning a two digit code for the country,
          // but we want the full country name
          address += `${card.address_zip}. ${card.address_country}`

          return [
            id,
            indent(card.name, 2),
            indent(`${card.brand} ${number}`, 2),
            indent(address, 2)
          ].join('\n')
        })
        .join('\n\n')

      const elapsed = ms(new Date() - start)
      console.log(
        `> ${cards.cards.length} card${cards.cards.length === 1
          ? ''
          : 's'} found under ${chalk.bold(
          (currentTeam && currentTeam.slug) || user.username || user.email
        )} ${chalk.gray(`[${elapsed}]`)}`
      )
      if (text) {
        console.log(`\n${text}\n`)
      }

      break
    }

    case 'set-default': {
      if (args.length > 1) {
        error('Invalid number of arguments')
        return exit(1)
      }

      const start = new Date()

      let cards
      try {
        cards = await creditCards.ls()
      } catch (err) {
        error(err.message)
        return
      }

      if (cards.cards.length === 0) {
        error('You have no credit cards to choose from')
        return exit(0)
      }

      let cardId = args[0]

      if (cardId === undefined) {
        const elapsed = ms(new Date() - start)
        const message = `Selecting a new default payment card for ${chalk.bold(
          (currentTeam && currentTeam.slug) || user.username || user.email
        )} ${chalk.gray(`[${elapsed}]`)}`
        const choices = buildInquirerChoices(cards)

        cardId = await listInput({
          message,
          choices,
          separator: true,
          abort: 'end'
        })
      }

      // Check if the provided cardId (in case the user
      // typed `now billing set-default <some-id>`) is valid
      if (cardId) {
        const label = `Are you sure that you to set this card as the default?`
        const confirmation = await promptBool(label, {
          trailing: '\n'
        })
        if (!confirmation) {
          info('Aborted')
          break
        }
        const start = new Date()
        await creditCards.setDefault(cardId)

        const card = cards.cards.find(card => card.id === cardId)
        const elapsed = ms(new Date() - start)
        success(
          `${card.brand} ending in ${card.last4} is now the default ${chalk.gray(
            `[${elapsed}]`
          )}`
        )
      } else {
        console.log('No changes made')
      }

      break
    }

    case 'rm':
    case 'remove': {
      if (args.length > 1) {
        error('Invalid number of arguments')
        return exit(1)
      }

      const start = new Date()
      let cards
      try {
        cards = await creditCards.ls()
      } catch (err) {
        error(err.message)
        return
      }

      if (cards.cards.length === 0) {
        error(
          `You have no credit cards to choose from to delete under ${chalk.bold(
            (currentTeam && currentTeam.slug) || user.username || user.email
          )}`
        )
        return exit(0)
      }

      let cardId = args[0]

      if (cardId === undefined) {
        const elapsed = ms(new Date() - start)
        const message = `Selecting a card to ${chalk.underline(
          'remove'
        )} under ${chalk.bold(
          (currentTeam && currentTeam.slug) || user.username || user.email
        )} ${chalk.gray(`[${elapsed}]`)}`
        const choices = buildInquirerChoices(cards)

        cardId = await listInput({
          message,
          choices,
          separator: true,
          abort: 'start'
        })
      }

      // Shoud check if the provided cardId (in case the user
      // typed `now billing rm <some-id>`) is valid
      if (cardId) {
        const label = `Are you sure that you want to remove this card?`
        const confirmation = await promptBool(label)
        if (!confirmation) {
          console.log('Aborted')
          break
        }
        const start = new Date()
        await creditCards.rm(cardId)

        const deletedCard = cards.cards.find(card => card.id === cardId)
        const remainingCards = cards.cards.filter(card => card.id !== cardId)

        let text = `${deletedCard.brand} ending in ${deletedCard.last4} was deleted`
        //  ${chalk.gray(`[${elapsed}]`)}

        if (cardId === cards.defaultCardId) {
          if (remainingCards.length === 0) {
            // The user deleted the last card in their account
            text += `\n${chalk.yellow('Warning!')} You have no default card`
          } else {
            // We can't guess the current default card – let's ask the API
            const cards = await creditCards.ls()
            const newDefaultCard = cards.cards.find(
              card => card.id === cards.defaultCardId
            )

            text += `\n${newDefaultCard.brand} ending in ${newDefaultCard.last4} in now default for ${chalk.bold(
              (currentTeam && currentTeam.slug) || user.username || user.email
            )}`
          }
        }

        const elapsed = ms(new Date() - start)
        text += ` ${chalk.gray(`[${elapsed}]`)}`
        success(text)
      } else {
        console.log('No changes made')
      }

      break
    }

    case 'add': {
      addBilling({
        creditCards,
        currentTeam,
        user
      })

      break
    }

    default:
      error('Please specify a valid subcommand: ls | add | rm | set-default')
      help()
      exit(1)
  }

  creditCards.close()
}
