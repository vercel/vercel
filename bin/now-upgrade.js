#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const ms = require('ms')

// Ours
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const NowPlans = require('../lib/plans')
const indent = require('../lib/indent')
const listInput = require('../lib/utils/input/list')
const code = require('../lib/utils/output/code')
const error = require('../lib/utils/output/error')
const success = require('../lib/utils/output/success')
const cmd = require('../lib/utils/output/cmd')
const logo = require('../lib/utils/output/logo')

const { bold } = chalk

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

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now upgrade`)} [plan]

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List available plans and pick one interactively

      ${chalk.cyan('$ now upgrade')}

      ${chalk.yellow('NOTE:')} ${chalk.gray('Make sure you have a payment method, or add one:')}

      ${chalk.cyan(`$ now billing add`)}

  ${chalk.gray('–')} Pick a specific plan (premium):

      ${chalk.cyan(`$ now upgrade premium`)}
  `)
}

// Options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

const exit = code => {
  // We give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  setTimeout(() => process.exit(code || 0), 100)
}

if (argv.help) {
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

async function run({ token, config: { currentTeam, user } }) {
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
    message += `\n> Select a plan for ${bold((currentTeam && currentTeam.slug) || user.username || user.email)} ${chalk.gray(`[${elapsed}]`)}`
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
        `You have no payment methods available. Run ${cmd('now billing add')} to add one`
      )
    } else {
      error(`An unknow error occured. Please try again later ${err.message}`)
    }
    plans.close()
    return
  }

  if (currentPlan.until && newPlan.id !== 'oss') {
    success(
      `The cancelation has been undone. You're back on the ${chalk.bold(`${newPlan.name} plan`)}`
    )
  } else if (newPlan.until) {
    success(
      `Your plan will be switched to ${chalk.bold(newPlan.name)} in ${chalk.bold(newPlan.until)}. Your card will not be charged again`
    )
  } else {
    success(`You're now on the ${chalk.bold(`${newPlan.name} plan`)}`)
  }

  plans.close()
}
