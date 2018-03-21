#!/usr/bin/env node
// @flow

// Packages
const chalk = require('chalk')
const arg = require('arg')

// Utilities
const cmd = require('../../../util/output/cmd')
const createOutput = require('../../../util/output')
const Now = require('../util/')
const logo = require('../../../util/output/logo')
const elapsed = require('../../../util/output/elapsed')
const argCommon = require('../util/arg-common')()
const wait = require('../../../util/output/wait')
const { handleError } = require('../util/error')
const getContextName = require('../util/get-context-name')


const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now inspect`)} <url>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline('FILE')}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline('DIR')}    Path to the global ${'`.now`'} directory
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')}        Login token
    -d, --debug                    Debug mode [off]
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Get information about a deployment by its unique URL

    ${chalk.cyan('$ now inspect my-deployment-ji2fjij2.now.sh')}

  ${chalk.gray('-')} Get information about the deployment an alias points to

    ${chalk.cyan('$ now scale my-deployment.now.sh')}
  `)
}

// $FlowFixMe
module.exports = async function main (ctx) {
  let id
  let deployment
  let argv;

  try {
    argv = arg(ctx.argv.slice(3), {
      ...argCommon
    })
  } catch (err) {
    handleError(err)
    return 1;
  }

  if (argv['--help']) {
    help()
    return 2;
  }

  const apiUrl = ctx.apiUrl
  const debugEnabled = argv['--debug']
  const output = createOutput({ debug: debugEnabled })
  const { log, error } = output;

  // extract the first parameter
  id = argv._[0]

  if (argv._.length !== 1) {
    error(`${cmd('now inspect <url>')} expects exactly one argument`)
    help();
    return 1;
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { currentTeam } = sh;
  const contextName = getContextName(sh);

  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })

  // resolve the deployment, since we might have been given an alias
  const depFetchStart = Date.now();
  const cancelWait = wait(`Fetching deployment "${id}" in ${chalk.bold(contextName)}`);

  try {
    deployment = await now.findDeployment(id)
    cancelWait();
  } catch (err) {
    cancelWait();
    if (err.status === 404) {
      error(`Failed to find deployment "${id}" in ${chalk.bold(contextName)}`)
      return 1;
    } else {
      // unexpected
      throw err;
    }
  }

  log(`Fetched deployment "${deployment.url}" ${elapsed(Date.now() - depFetchStart)}`);

  now.close();
  return 0;
}
