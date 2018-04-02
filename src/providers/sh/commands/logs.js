#!/usr/bin/env node

// Packages
const mri = require('mri')
const chalk = require('chalk')
const dateformat = require('dateformat')

// Utilities
const Now = require('../util')
const { handleError, error } = require('../util/error')
const logo = require('../../../util/output/logo')
const { maybeURL, normalizeURL, parseInstanceURL } = require('../../../util/url')
const printEvents = require('../util/events')
const exit = require('../../../util/exit')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now logs`)} <deploymentId|url>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -a, --all                      Include access logs
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -f, --follow                   Wait for additional data [off]
    -n ${chalk.bold.underline('NUMBER')}                      Number of logs [1000]
    -q ${chalk.bold.underline('QUERY')}, --query=${chalk.bold.underline(
    'QUERY'
  )}        Search query
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    --since=${chalk.bold.underline(
      'SINCE'
    )}                  Only return logs after date (ISO 8601)
    --until=${chalk.bold.underline(
      'UNTIL'
    )}                  Only return logs before date (ISO 8601), ignored for ${'`-f`'}
    -T, --team                     Set a custom team scope
    -o ${chalk.bold.underline('MODE')}, --output=${chalk.bold.underline(
      'MODE'
    )}         Specify the output format (${Object.keys(logPrinters).join('|')}) [short]

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Print the logs for the deployment ${chalk.dim(
    '`deploymentId`'
  )}

    ${chalk.cyan('$ now logs deploymentId')}
`)
}

let argv
let deploymentIdOrURL

let debug
let apiUrl
let query
let follow
let types
let outputMode

let since
let until
let instanceId

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    string: ['query', 'since', 'until', 'output'],
    boolean: ['help', 'all', 'debug', 'follow'],
    alias: {
      help: 'h',
      all: 'a',
      debug: 'd',
      query: 'q',
      follow: 'f',
      output: 'o'
    }
  })

  argv._ = argv._.slice(1)
  deploymentIdOrURL = argv._[0]

  if (argv.help || !deploymentIdOrURL || deploymentIdOrURL === 'help') {
    help()
    await exit(0)
  }

  try {
    since = argv.since ? toTimestamp(argv.since) : 0
  } catch (err) {
    error(`Invalid date string: ${argv.since}`)
    process.exit(1)
  }

  try {
    until = argv.until ? toTimestamp(argv.until) : 0
  } catch (err) {
    error(`Invalid date string: ${argv.until}`)
    process.exit(1)
  }

  if (maybeURL(deploymentIdOrURL)) {
    const normalizedURL = normalizeURL(deploymentIdOrURL)
    if (normalizedURL.includes('/')) {
      error(`Invalid deployment url: can't include path (${deploymentIdOrURL})`)
      process.exit(1)
    }

    ;[deploymentIdOrURL, instanceId] = parseInstanceURL(normalizedURL)
  }

  debug = argv.debug
  apiUrl = ctx.apiUrl

  query = argv.query || ''
  follow = argv.f
  types = argv.all ? [] : ['command', 'stdout', 'stderr', 'exit']
  outputMode = argv.output in logPrinters ? argv.output : 'short'

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')

  return printLogs({ token, sh })
}

module.exports = async ctx => {
  try {
    await main(ctx)
    await exit(0) // TODO how to exit cleanly. who is blocking?
  } catch (err) {
    handleError(err)
    process.exit(1)
  }
}

function printLogs({ token, sh: { currentTeam } }) {
  const now = new Now({ apiUrl, token, debug, currentTeam })
  const findOpts = { query, types, since, until, instanceId, follow }
  try {
    return printEvents(now, deploymentIdOrURL, currentTeam,
      { mode: 'logs', printEvent, quiet: false, debug, findOpts });
  } finally {
    now.close()
  }
}

function printLogShort(log) {
  let data
  const obj = log.object
  if (log.type === 'request') {
    data =
      `REQ "${obj.method} ${obj.uri} ${obj.protocol}"` +
      ` ${obj.remoteAddr} - ${obj.remoteUser || ''}` +
      ` "${obj.referer || ''}" "${obj.userAgent || ''}"`
  } else if (log.type === 'response') {
    data =
      `RES "${obj.method} ${obj.uri} ${obj.protocol}"` +
      ` ${obj.status} ${obj.bodyBytesSent}`
  } else {
    data = obj
      ? JSON.stringify(obj, null, 2)
      : (log.text || '').replace(/\n$/, '')
  }

  const date = dateformat(log.date, 'mm/dd hh:MM TT')

  data.split('\n').forEach((line, i) => {
    if (i === 0) {
      console.log(`${chalk.dim(date)}  ${line}`)
    } else {
      console.log(`${' '.repeat(date.length)}  ${line}`)
    }
  })

  return 0
}

function printLogRaw(log) {
  console.log(log.object ? JSON.stringify(log.object) : log.text)
  return 0
}

const logPrinters = {
  short: printLogShort,
  raw: printLogRaw
}

function printEvent(event) {
  return logPrinters[outputMode](event, () => {})
}

function toTimestamp(datestr) {
  const t = Date.parse(datestr)
  if (isNaN(t)) {
    throw new TypeError('Invalid date string')
  }
  return t
}
