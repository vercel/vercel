#!/usr/bin/env node

// Packages
const minimist = require('minimist')
const chalk = require('chalk')
const fetch = require('node-fetch')
const ora = require('ora')

// Utilities
const logo = require('../lib/utils/output/logo')
const { handleError } = require('../lib/error')
const {
  readConfigFile,
  writeToConfigFile,
  readAuthConfigFile,
  writeToAuthConfigFile
} = require('../../../../util/config-files')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now logout`)}

  ${chalk.dim('Options:')}

    -h, --help              output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline(
    'FILE'
  )}  config file

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Logout from the CLI:

    ${chalk.cyan('$ now logout')}
`)
}

let argv
let apiUrl
let endpoint

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    boolean: ['help'],
    alias: {
      help: 'h'
    }
  })

  apiUrl = argv.url || 'https://api.zeit.co'
  endpoint = apiUrl + '/www/user/tokens/'

  if (argv.help) {
    help()
    process.exit(0)
  }

  logout()
}

module.exports = async ctx => {
  try {
    await main(ctx)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }
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

  const configContent = JSON.parse(readConfigFile())


  if (configContent.sh) {
    delete configContent.sh
  }

  const authContent = JSON.parse(readAuthConfigFile())
  const {credentials} = authContent
  const related = credentials.find(item => item.provider === 'sh')
  const index = credentials.indexOf(related)

  credentials.splice(index, 1)
  authContent.credentials = credentials

  try {
    await writeToConfigFile(configContent)
    await writeToAuthConfigFile(authContent)
  } catch (err) {
    spinner.fail(`Couldn't remove config while logging out`)
    process.exit(1)
  }

  let tokenId

  try {
    tokenId = await getTokenId(argv.token || related.token)
  } catch (err) {
    spinner.fail('Not able to get token id on logout')
    process.exit(1)
  }

  if (!tokenId) {
    return
  }

  try {
    await revokeToken(argv.token || related.token, tokenId)
  } catch (err) {
    spinner.fail('Could not revoke token on logout')
    process.exit(1)
  }

  spinner.succeed('Logged out!')
}
