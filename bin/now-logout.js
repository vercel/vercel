#!/usr/bin/env node

// Packages
const minimist = require('minimist')
const chalk = require('chalk')
const fetch = require('node-fetch')
const ora = require('ora')

// Utilities
const cfg = require('../lib/cfg')
const logo = require('../lib/utils/output/logo')

const argv = minimist(process.argv.slice(2), {
  string: ['config'],
  boolean: ['help'],
  alias: {
    help: 'h',
    config: 'c'
  }
})

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now logout`)}

  ${chalk.dim('Options:')}

    -h, --help              output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  config file

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Logout from the CLI:

    ${chalk.cyan('$ now logout')}
`)
}

if (argv.help) {
  help()
  process.exit(0)
}

const apiUrl = argv.url || 'https://api.zeit.co'
const endpoint = apiUrl + '/www/user/tokens/'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

const requestHeaders = token => ({
  headers: {
    Authorization: `bearer ${token}`
  }
})

const getTokenId = async token => {
  const result = await fetch(endpoint, requestHeaders(token))
  const tokenList = await result.json()

  if (!tokenList.tokens) {
    return
  }

  const tokenInfo = tokenList.tokens.find(t => token === t.token)

  if (!tokenInfo) {
    return
  }

  return tokenInfo.id
}

const revokeToken = async (token, tokenId) => {
  const details = {
    method: 'DELETE'
  }

  Object.assign(details, requestHeaders(token))
  const result = await fetch(endpoint + encodeURIComponent(tokenId), details)

  if (!result.ok) {
    console.error('Not able to log out')
  }
}

const logout = async () => {
  const spinner = ora({
    text: 'Logging out...'
  }).start()

  const config = await cfg.read()

  try {
    await cfg.removeFile()
  } catch (err) {
    spinner.fail(`Couldn't remove config while logging out`)
    process.exit(1)
  }

  let tokenId

  try {
    tokenId = await getTokenId(argv.token || config.token)
  } catch (err) {
    spinner.fail('Not able to get token id on logout')
    process.exit(1)
  }

  if (!tokenId) {
    return
  }

  try {
    await revokeToken(argv.token || config.token, tokenId)
  } catch (err) {
    spinner.fail('Could not revoke token on logout')
    process.exit(1)
  }

  spinner.succeed('Logged out!')
}

logout()
