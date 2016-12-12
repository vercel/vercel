// Native
import os from 'os'

// Packages
import {stringify as stringifyQuery} from 'querystring'
import chalk from 'chalk'
import fetch from 'node-fetch'
import {validate} from 'email-validator'
import readEmail from 'email-prompt'
import ora from 'ora'

// Ours
import pkg from '../../package'
import ua from './ua'
import * as cfg from './cfg'

async function getVerificationData(url, email) {
  const tokenName = `Now CLI ${os.platform()}-${os.arch()} ${pkg.version} (${os.hostname()})`
  const data = JSON.stringify({email, tokenName})
  const res = await fetch(`${url}/now/registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'User-Agent': ua
    },
    body: data
  })

  if (res.status !== 200) {
    throw new Error('Verification error')
  }

  const body = await res.json()
  return body
}

async function verify(url, email, verificationToken) {
  const query = {
    email,
    token: verificationToken
  }

  const res = await fetch(`${url}/now/registration/verify?${stringifyQuery(query)}`, {
    headers: {'User-Agent': ua}
  })
  const body = await res.json()
  return body.token
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function register(url, {retryEmail = false} = {}) {
  const email = await readEmail({invalid: retryEmail})
  process.stdout.write('\n')

  if (!validate(email)) {
    return register(url, {retryEmail: true})
  }

  const {token, securityCode} = await getVerificationData(url, email)
  console.log(`> Please follow the link sent to ${chalk.bold(email)} to log in.`)

  if (securityCode) {
    console.log(`> Verify that the provided security code in the email matches ${chalk.cyan(chalk.bold(securityCode))}.`)
  }

  process.stdout.write('\n')

  const spinner = ora({
    text: 'Waiting for confirmation...',
    color: 'black'
  }).start()

  let final

  do {
    await sleep(2500)

    try {
      final = await verify(url, email, token)
    } catch (err) {}
  } while (!final)

  spinner.text = 'Confirmed email address!'
  spinner.stopAndPersist('✔')

  process.stdout.write('\n')

  return {email, token: final}
}

export default async function (url) {
  const loginData = await register(url)
  cfg.merge(loginData)
  return loginData.token
}
