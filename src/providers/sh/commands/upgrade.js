#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const ms = require('ms')

// Utilities
const NowPlans = require('../util/plans')
const indent = require('../util/indent')
const listInput = require('../../../util/input/list')
const code = require('../../../util/output/code')
const error = require('../../../util/output/error')
const success = require('../../../util/output/success')
const cmd = require('../../../util/output/cmd')
const logo = require('../../../util/output/logo')
const { handleError } = require('../util/error')
const getWelcome = require('../../../get-welcome')
const providers = require('../../')

const { bold } = chalk

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now upgrade`)} [plan]

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

  ${chalk.gray('–')} List available plans and pick one interactively

      ${chalk.cyan('$ now upgrade')}

      ${chalk.yellow('NOTE:')} ${chalk.gray(
    'Make sure you have a payment method, or add one:'
  )}

      ${chalk.cyan(`$ now billing add`)}

  ${chalk.gray('–')} Pick a specific plan (premium):

      ${chalk.cyan(`$ now upgrade premium`)}
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

  if (!ctx.authConfig.credentials.length) {
    console.log(getWelcome('sh', providers))
    return 0
  }

  argv._ = argv._.slice(1)

  debug = argv.debug
  apiUrl = argv.url || 'https://api.zeit.co'

  if (argv.help || argv._[0] === 'help') {
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

function buildInquirerChoices(current, until) {
  if (until) {
    until = until.split(' ')
    until = ' for ' + chalk.bold(until[0]) + ' more ' + until[1]
  } else {
    until = ''
  }

  const currentText = bold('(current)')
  let ossName = `OSS ${bold('FREE')}`
  let premiumName = `Premium ${bold('$15')}`
  let proName = `Pro ${bold('$50')}`
  let advancedName = `Advanced ${bold('$200')}`

  switch (current) {
    case 'oss': {
      ossName += indent(currentText, 6)
      break
    }
    case 'premium': {
      premiumName += indent(currentText, 3)
      break
    }
    case 'pro': {
      proName += indent(currentText, 7)
      break
    }
    case 'advanced': {
      advancedName += indent(currentText, 1)
      break
    }
    default: {
      ossName += indent(currentText, 6)
    }
  }

  return [
    {
      name: ossName,
      value: 'oss',
      short: `OSS ${bold('FREE')}`
    },
    {
      name: premiumName,
      value: 'premium',
      short: `Premium ${bold('$15')}`
    },
    {
      name: proName,
      value: 'pro',
      short: `Pro ${bold('$50')}`
    },
    {
      name: advancedName,
      value: 'advanced',
      short: `Advanced ${bold('$200')}`
    }
  ]
}

async function run({ token, sh: { currentTeam, user } }) {
  const args = argv._
  if (args.length > 1) {
    error('Invalid number of arguments')
    return exit(1)
  }

  const start = new Date()
  const plans = new NowPlans({ apiUrl, token, debug, currentTeam })

  let planId = args[0]

  if (![undefined, 'oss', 'premium', 'pro', 'advanced'].includes(planId)) {
    error(`Invalid plan name – should be ${code('oss')} or ${code('premium')}`)
    return exit(1)
  }

  const currentPlan = await plans.getCurrent()

  if (planId === undefined) {
    const elapsed = ms(new Date() - start)

    let message = `For more info, please head to https://zeit.co`
    message = currentTeam
      ? `${message}/${currentTeam.slug}/settings/plan`
      : `${message}/account/plan`
    message += `\n> Select a plan for ${bold(
      (currentTeam && currentTeam.slug) || user.username || user.email
    )} ${chalk.gray(`[${elapsed}]`)}`
    const choices = buildInquirerChoices(currentPlan.id, currentPlan.until)

    planId = await listInput({
      message,
      choices,
      separator: false,
      abort: 'end'
    })
  }

  if (
    planId === undefined ||
    (planId === currentPlan.id && currentPlan.until === undefined)
  ) {
    return console.log('No changes made')
  }

  let newPlan

  try {
    newPlan = await plans.set(planId)
  } catch (err) {
    if (err.code === 'customer_not_found' || err.code === 'source_not_found') {
      error(
        `You have no payment methods available. Run ${cmd(
          'now billing add'
        )} to add one`
      )
    } else {
      error(`An unknow error occured. Please try again later ${err.message}`)
    }
    plans.close()
    return
  }

  if (currentPlan.until && newPlan.id !== 'oss') {
    success(
      `The cancelation has been undone. You're back on the ${chalk.bold(
        `${newPlan.name} plan`
      )}`
    )
  } else if (newPlan.until) {
    success(
      `Your plan will be switched to ${chalk.bold(
        newPlan.name
      )} in ${chalk.bold(newPlan.until)}. Your card will not be charged again`
    )
  } else {
    success(`You're now on the ${chalk.bold(`${newPlan.name} plan`)}`)
  }

  plans.close()
}
