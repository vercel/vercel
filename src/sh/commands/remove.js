#!/usr/bin/env node
//@flow

// Packages
const mri = require('mri')
const chalk = require('chalk')
const ms = require('ms')
const plural = require('pluralize')
const table = require('text-table')

// Utilities
const Now = require('../util')
const createOutput = require('../../../util/output')
const wait = require('../../../util/output/wait')
const logo = require('../../../util/output/logo')
const cmd = require('../../../util/output/cmd')
const elapsed = require('../../../util/output/elapsed')
const { normalizeURL } = require('../../../util/url')
const getContextName = require('../util/get-context-name')
import getAliases from '../util/alias/get-aliases'

const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} now remove`
  )} [...deploymentId|deploymentName]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -y, --yes                      Skip confirmation
    -s, --safe                     Skip deployments with an active alias
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Remove a deployment identified by ${chalk.dim(
    '`deploymentId`'
  )}

    ${chalk.cyan('$ now rm deploymentId')}

  ${chalk.gray('–')} Remove all deployments with name ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now rm my-app')}

  ${chalk.gray('–')} Remove two deployments with IDs ${chalk.dim(
    '`eyWt6zuSdeus`'
  )} and ${chalk.dim('`uWHoA9RQ1d1o`')}

    ${chalk.cyan('$ now rm eyWt6zuSdeus uWHoA9RQ1d1o')}
`)
}

// Options

module.exports = async function main (ctx: any): Promise<number>{
  let argv;

  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug', 'hard', 'yes', 'safe'],
    alias: {
      help: 'h',
      debug: 'd',
      yes: 'y',
      safe: 's'
    }
  })

  argv._ = argv._.slice(1)

  const apiUrl = ctx.apiUrl
  const hard = argv.hard || false
  const skipConfirmation = argv.yes || false
  const ids = argv._
  const debugEnabled = argv.debug
  const output = createOutput({ debug: debugEnabled })
  const { success, error, log } = output;

  if (ids.length < 1) {
    error(`${cmd('now rm')} expects at least one argument`);
    help();
    return 1;
  }

  if (argv.help || ids[0] === 'help') {
    help()
    return 2;
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const {currentTeam} = sh;
  const contextName = getContextName(sh);

  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })

  const cancelWait = wait(`Fetching deployment(s) ${ids.map(id => `"${id}"`).join(' ')} in ${chalk.bold(contextName)}`);

  let deployments;
  const findStart = Date.now();

  try {
    deployments = await now.list(null, { version: 3 })
  } catch (err) {
    cancelWait();
    throw err;
  }

  let matches = deployments.filter(d => {
    return ids.some(id => {
      return d.uid === id || d.name === id || d.url === normalizeURL(id)
    })
  })

  let aliases;

  try {
    aliases = await Promise.all(matches.map(depl => getAliases(now, depl.uid)))
    cancelWait();
  } catch (err) {
    cancelWait();
    throw err;
  }

  matches = matches.filter((match, i) => {
    if (argv.safe && aliases[i].length > 0) {
      return false
    }

    match.aliases = aliases[i]
    return true
  })

  if (matches.length === 0) {
    log(
      `Could not find ${argv.safe
        ? 'unaliased'
        : 'any'} deployments matching ${ids
        .map(id => chalk.bold(`"${id}"`))
        .join(', ')}. Run ${cmd('now ls')} to list.`
    )
    return 1;
  }

  log(`Found ${plural('deployment', matches.length, true)} for removal in ${chalk.bold(contextName)} ${elapsed(Date.now() - findStart)}`);

  if (!skipConfirmation) {
    const confirmation = (await readConfirmation(matches, output)).toLowerCase()

    if (confirmation !== 'y' && confirmation !== 'yes') {
      output.log('Aborted');
      now.close();
      return 1
    }
  }

  const start = new Date()

  await Promise.all(matches.map(depl => now.remove(depl.uid, { hard })))

  success(`${plural('deployment', matches.length, true)} removed ${elapsed(Date.now() - start)}`)
  matches.forEach(depl => {
    console.log(`${chalk.gray('-')} ${chalk.bold(depl.url)}`)
  })

  // if we close normally, we get a really odd error:
  //  Error: unexpected end of file
  //  at Zlib.zlibOnError [as onerror] (zlib.js:142:17) Error: unexpected end of file
  //  at Zlib.zlibOnError [as onerror] (zlib.js:142:17)
  // which seems fixable only by exiting directly here, and only
  // impacts this command, consistently
  //now.close()
  process.exit(0);
  return 0
}

function readConfirmation(matches, output) {
  return new Promise(resolve => {
    output.log(
      `The following ${
        plural('deployment', matches.length, true)
      } will be permanently removed:`
    )

    const tbl = table(
      matches.map(depl => {
        const time = chalk.gray(ms(new Date() - depl.created) + ' ago')
        const url = depl.url ? chalk.underline(`https://${depl.url}`) : ''
        return ['  ' + depl.uid, url, time]
      }),
      { align: ['l', 'r', 'l'], hsep: ' '.repeat(6) }
    )
    output.print(tbl + '\n')

    for (const depl of matches) {
      for (const alias of depl.aliases) {
        output.warn(
          `Deployment ${chalk.bold(depl.url)} ` +
            `is an alias for ${chalk.underline(
              `https://${alias.alias}`
            )} and will be removed.`
        )
      }
    }

    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    )

    process.stdin
      .on('data', d => {
        process.stdin.pause()
        resolve(d.toString().trim())
      })
      .resume()
  })
}
