// Native
const { stringify: stringifyQuery } = require('querystring')
const { platform, arch, hostname } = require('os')

// Packaages
const fetch = require('node-fetch')
const debug = require('debug')('now:sh:login')
const promptEmail = require('email-prompt')
const ms = require('ms')
const { validate: validateEmail } = require('email-validator')
const chalk = require('chalk')
const mri = require('mri')

// Utilities
const { version } = require('../../../util/pkg')
const ua = require('../util/ua')
const error = require('../../../util/output/error')
const aborted = require('../../../util/output/aborted')
const wait = require('../../../util/output/wait')
const highlight = require('../../../util/output/highlight')
const info = require('../../../util/output/info')
const ok = require('../../../util/output/ok')
const cmd = require('../../../util/output/cmd')
const ready = require('../../../util/output/ready')
const param = require('../../../util/output/param')
const eraseLines = require('../../../util/output/erase-lines')
const sleep = require('../../../util/sleep')
const getUser = require('../../../util/get-user')
const {
  writeToAuthConfigFile,
  writeToConfigFile
} = require('../../../util/config-files')
const getNowDir = require('../../../config/global-path')
const hp = require('../../../util/humanize-path')
const logo = require('../../../util/output/logo')
const exit = require('../../../util/exit')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now login`)} <email>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Log into the Now platform

    ${chalk.cyan('$ now login')}

  ${chalk.gray('–')} Log in using a specific email address

    ${chalk.cyan('$ now login john@doe.com')}
`)
}

// POSTs to /now/registration – either creates an account or performs a login
// returns {token, securityCode}
// token: should be used to verify the status of the login process
// securityCode: will be sent to the user in the email body
const getVerificationData = async ({ apiUrl, email }) => {
  const hyphens = new RegExp('-', 'g')
  const host = hostname().replace(hyphens, ' ').replace('.local', '')
  const tokenName = `Now CLI on ${host}`

  const data = JSON.stringify({ email, tokenName })

  debug('POST /now/registration')
  let res
  try {
    res = await fetch(`${apiUrl}/now/registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': ua
      },
      body: data
    })
  } catch (err) {
    debug('error fetching /now/registration: %O', err.stack)
    throw new Error(
      error(
        `An unexpected error occurred while trying to login: ${err.message}`
      )
    )
  }

  debug('parsing response from POST /now/registration')

  let body
  try {
    body = await res.json()
  } catch (err) {
    debug(
      `error parsing the response from /now/registration as JSON – got %O`,
      err.stack
    )
    throw new Error(
      error(
        `An unexpected error occurred while trying to log in: ${err.message}`
      )
    )
  }

  return body
}

const verify = async ({ apiUrl, email, verificationToken }) => {
  const query = {
    email,
    token: verificationToken
  }

  debug('GET /now/registration/verify')

  let res
  try {
    res = await fetch(
      `${apiUrl}/now/registration/verify?${stringifyQuery(query)}`,
      {
        headers: { 'User-Agent': ua }
      }
    )
  } catch (err) {
    debug(`error fetching /now/registration/verify: $O`, err.stack)
    throw new Error(
      error(
        `An unexpected error occurred while trying to verify your login: ${err.message}`
      )
    )
  }

  debug('parsing response from GET /now/registration/verify')

  let body
  try {
    body = await res.json()
  } catch (err) {
    debug(
      `error parsing the response from /now/registration/verify: $O`,
      err.stack
    )
    throw new Error(
      error(
        `An unexpected error occurred while trying to verify your login: ${err.message}`
      )
    )
  }

  return body.token
}

const readEmail = async () => {
  let email
  try {
    email = await promptEmail({ start: info('Enter your email: ') })
  } catch (err) {
    console.log() // \n
    if (err.message === 'User abort') {
      throw new Error(aborted('No changes made.'))
    }
    if (err.message === 'stdin lacks setRawMode support') {
      throw new Error(
        error(
          `Interactive mode not supported – please run ${cmd(
            'now login you@domain.com'
          )}`
        )
      )
    }
  }
  console.log() // \n
  return email
}

const login = async ctx => {
  const argv = mri(ctx.argv.slice(2), {
    boolean: ['help'],
    alias: {
      help: 'h'
    }
  })

  if (argv.help) {
    help()
    await exit(0)
  }

  argv._ = argv._.slice(1)

  const apiUrl =
    (ctx.config.sh && ctx.config.sh.apiUrl) || 'https://api.zeit.co'
  let email
  let emailIsValid = false
  let stopSpinner

  const possibleAddress = argv._[0]

  // if the last arg is not the command itself, then maybe it's an email
  if (possibleAddress) {
    if (!validateEmail(possibleAddress)) {
      // if it's not a valid email, let's just error
      console.log(error(`Invalid email: ${param(possibleAddress)}.`))
      return 1
    }

    // valid email, no need to prompt the user
    email = possibleAddress
  } else {
    do {
      try {
        email = await readEmail()
      } catch (err) {
        let erase = ''
        if (err.message.includes('Aborted')) {
          // no need to keep the prompt if the user `ctrl+c`ed
          erase = eraseLines(2)
        }
        console.log(erase + err.message)
        return 1
      }
      emailIsValid = validateEmail(email)
      if (!emailIsValid) {
        // let's erase the `> Enter email [...]`
        // we can't use `console.log()` because it appends a `\n`
        // we need this check because `email-prompt` doesn't print
        // anything if there's no TTY
        process.stdout.write(eraseLines(2))
      }
    } while (!emailIsValid)
  }

  let verificationToken
  let securityCode

  stopSpinner = wait('Sending you an email')

  try {
    const data = await getVerificationData({ apiUrl, email })
    verificationToken = data.token
    securityCode = data.securityCode
  } catch (err) {
    stopSpinner()
    console.log(err.message)
    return 1
  }

  stopSpinner()

  // Clear up `Sending email` success message
  process.stdout.write(eraseLines(possibleAddress ? 1 : 2))

  console.log(info(
    `We sent an email to ${highlight(email)}. Please follow the steps provided`,
    `  inside it and make sure the security code matches ${highlight(securityCode)}.`
  ))

  stopSpinner = wait('Waiting for your confirmation')

  let token

  while (!token) {
    try {
      await sleep(ms('1s'))
      token = await verify({ apiUrl, email, verificationToken })
    } catch (err) {
      if (/invalid json response body/.test(err.message)) {
        // /now/registraton is currently returning plain text in that case
        // we just wait for the user to click on the link
      } else {
        stopSpinner()
        console.log(err.message)
        return 1
      }
    }
  }

  stopSpinner()
  console.log(ok('Email confirmed'))

  stopSpinner = wait('Feching your personal details')
  let user
  try {
    user = await getUser({ apiUrl, token })
  } catch (err) {
    stopSpinner()
    console.log(err)
    return 1
  }

  const index = ctx.authConfig.credentials.findIndex(c => c.provider === 'sh')
  const obj = { provider: 'sh', token }
  if (index === -1) {
    // wasn't logged in before
    ctx.authConfig.credentials.push(obj)
  } else {
    // let's just replace the existing object
    ctx.authConfig.credentials[index] = obj
  }

  // NOTE: this will override any existing config for `sh`
  ctx.config.sh = { user }

  writeToAuthConfigFile(ctx.authConfig)
  writeToConfigFile(ctx.config)

  stopSpinner()
  console.log(ok('Fetched your personal details'))

  console.log(
    ready(
      `Authentication token and personal details saved in ${param(
        hp(getNowDir())
      )}`
    )
  )

  return ctx
}

module.exports = login
