// Native
const os = require('os')

// Packages
const { stringify: stringifyQuery } = require('querystring')
const chalk = require('chalk')
const fetch = require('node-fetch')
const { validate } = require('email-validator')
const readEmail = require('email-prompt')
const ora = require('ora')

// Ours
const pkg = require('./pkg')
const ua = require('./ua')
const cfg = require('./cfg')

async function getVerificationData(url, email) {
  const tokenName = `Now CLI ${os.platform()}-${os.arch()} ${pkg.version} (${os.hostname()})`
  const data = JSON.stringify({ email, tokenName })
  const res = await fetch(`${url}/now/registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'User-Agent': ua
    },
    body: data
  })

  const body = await res.json()
  if (res.status !== 200) {
    throw new Error(
      `Verification error: ${res.status} – ${JSON.stringify(body)}`
    )
  }
  return body
}

async function verify(url, email, verificationToken) {
  const query = {
    email,
    token: verificationToken
  }

  const res = await fetch(
    `${url}/now/registration/verify?${stringifyQuery(query)}`,
    {
      headers: { 'User-Agent': ua }
    }
  )
  const body = await res.json()
  return body.token
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function register(url, { retryEmail = false } = {}) {
  let email
  try {
    email = await readEmail({ invalid: retryEmail })
  } catch (err) {
    process.stdout.write('\n')
    throw err
  }

  process.stdout.write('\n')

  if (!validate(email)) {
    return register(url, { retryEmail: true })
  }

  const { token, securityCode } = await getVerificationData(url, email)
  console.log(`> Please follow the link sent to ${chalk.bold(email)} to log in.`)

  if (securityCode) {
    console.log(`> Verify that the provided security code in the email matches ${chalk.cyan(chalk.bold(securityCode))}.`)
  }

  process.stdout.write('\n')

  const spinner = ora({
    text: 'Waiting for confirmation...'
  }).start()

  let final

  /* eslint-disable no-await-in-loop */
  do {
    await sleep(2500)

    try {
      final = await verify(url, email, token)
    } catch (err) {}
  } while (!final)
  /* eslint-enable no-await-in-loop */

  let user
  try {
    user = (await (await fetch(`${url}/www/user`, {
      headers: {
        Authorization: `Bearer ${final}`
      }
    })).json()).user
  } catch (err) {
    spinner.stop()
    throw new Error(`Couldn't retrieve user details ${err.message}`)
  }

  spinner.text = 'Confirmed email address!'
  spinner.stopAndPersist('✔')

  process.stdout.write('\n')

  return {
    token: final,
    user: {
      uid: user.uid,
      username: user.username,
      email: user.email
    },
    lastUpdate: Date.now()
  }
}

module.exports = async function(url) {
  const loginData = await register(url)
  await cfg.merge(loginData)
  await cfg.remove('currentTeam') // Make sure to logout the team too
  await cfg.remove('email') // Remove old schema from previus versions
  return loginData.token
}
