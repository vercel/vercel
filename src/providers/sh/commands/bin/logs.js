#!/usr/bin/env node

// Native
const qs = require('querystring')

// Packages
const minimist = require('minimist')
const chalk = require('chalk')
const dateformat = require('dateformat')
const io = require('socket.io-client')

// Utilities
const Now = require('../lib')
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const { handleError, error } = require('../lib/error')
const logo = require('../lib/utils/output/logo')
const { compare, deserialize } = require('../lib/logs')
const { maybeURL, normalizeURL, parseInstanceURL } = require('../lib/utils/url')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now logs`)} <deploymentId|url>

  ${chalk.dim('Options:')}

    -h, --help              output usage information
    -a, --all               include access logs
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline(
    'FILE'
  )}  config file
    -d, --debug             debug mode [off]
    -f                      wait for additional data [off]
    -n ${chalk.bold.underline('NUMBER')}               number of logs [1000]
    -q ${chalk.bold.underline('QUERY')}, --query=${chalk.bold.underline(
    'QUERY'
  )} search query
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )} login token
    --since=${chalk.bold.underline(
      'SINCE'
    )}           only return logs after date (ISO 8601)
    --until=${chalk.bold.underline(
      'UNTIL'
    )}           only return logs before date (ISO 8601), ignored if the f option is enbled.

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Print logs for the deployment ${chalk.dim(
    '`deploymentId`'
  )}

    ${chalk.cyan('$ now logs deploymentId')}
`)
}

let argv
let deploymentIdOrURL

let debug
let apiUrl
let limit
let query
let follow
let types

let since
let until
let instanceId

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    string: ['config', 'query', 'since', 'token', 'until'],
    boolean: ['help', 'all', 'debug', 'f'],
    alias: {
      help: 'h',
      all: 'a',
      config: 'c',
      debug: 'd',
      token: 't',
      query: 'q'
    }
  })

  argv._ = argv._.slice(1)
  deploymentIdOrURL = argv._[0]

  if (argv.help || !deploymentIdOrURL) {
    help()
    process.exit(0)
  }

  try {
    since = argv.since ? toSerial(argv.since) : null
  } catch (err) {
    error(`Invalid date string: ${argv.since}`)
    process.exit(1)
  }

  try {
    until = argv.until ? toSerial(argv.until) : null
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
  apiUrl = argv.url || 'https://api.zeit.co'

  if (argv.config) {
    cfg.setConfigFile(argv.config)
  }

  limit = typeof argv.n === 'number' ? argv.n : 1000
  query = argv.query || ''
  follow = argv.f
  types = argv.all ? [] : ['command', 'stdout', 'stderr', 'exit']

  const config = await cfg.read({ token: argv.token })

  let token
  try {
    token = config.token || (await login(apiUrl))
  } catch (err) {
    error(`Authentication error – ${err.message}`)
    process.exit(1)
  }

  await printLogs({ token, config })
}

module.exports = async ctx => {
  try {
    await main(ctx)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }
}

async function printLogs({ token, config: { currentTeam } }) {
  let buf = []
  let init = false
  let lastLog

  if (!follow) {
    onLogs(await fetchLogs({ token, currentTeam, since, until }))
    return
  }

  const isURL = deploymentIdOrURL.includes('.')
  const q = qs.stringify({
    deploymentId: isURL ? '' : deploymentIdOrURL,
    host: isURL ? deploymentIdOrURL : '',
    instanceId,
    types: types.join(','),
    query
  })

  const socket = io(`https://log-io.zeit.co?${q}`)
  socket.on('connect', () => {
    if (debug) {
      console.log('> [debug] Socket connected')
    }
  })

  socket.on('auth', callback => {
    if (debug) {
      console.log('> [debug] Socket authenticate')
    }
    callback(token)
  })

  socket.on('ready', () => {
    if (debug) {
      console.log('> [debug] Socket ready')
    }

    // For the case socket reconnected
    const _since = lastLog ? lastLog.serial : since

    fetchLogs({ token, currentTeam, since: _since }).then(logs => {
      init = true
      const m = {}
      logs.concat(buf.map(b => b.log)).forEach(l => {
        m[l.id] = l
      })
      buf = []
      onLogs(Object.values(m))
    })
  })

  socket.on('logs', l => {
    const log = deserialize(l)
    let timer
    if (init) {
      // Wait for other logs for a while
      // and sort them in the correct order
      timer = setTimeout(() => {
        buf.sort((a, b) => compare(a.log, b.log))
        const idx = buf.findIndex(b => b.log.id === log.id)
        buf.slice(0, idx + 1).forEach(b => {
          clearTimeout(b.timer)
          onLog(b.log)
        })
        buf = buf.slice(idx + 1)
      }, 300)
    }
    buf.push({ log, timer })
  })

  socket.on('disconnect', () => {
    if (debug) {
      console.log('> [debug] Socket disconnect')
    }
    init = false
  })

  socket.on('error', err => {
    if (debug) {
      console.log('> [debug] Socket error', err.stack)
    }
  })

  function onLogs(logs) {
    logs.sort(compare).forEach(onLog)
  }

  function onLog(log) {
    lastLog = log
    printLog(log)
  }
}

function printLog(log) {
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
      console.log(`${repeat(' ', date.length)}  ${line}`)
    }
  })
}

async function fetchLogs({ token, currentTeam, since, until } = {}) {
  const now = new Now({ apiUrl, token, debug, currentTeam })

  let logs
  try {
    logs = await now.logs(deploymentIdOrURL, {
      instanceId,
      types,
      limit,
      query,
      since,
      until
    })
  } catch (err) {
    handleError(err)
    process.exit(1)
  } finally {
    now.close()
  }

  return logs.map(deserialize)
}

function repeat(s, n) {
  return new Array(n + 1).join(s)
}

function toSerial(datestr) {
  const t = Date.parse(datestr)
  if (isNaN(t)) {
    throw new TypeError('Invalid date string')
  }

  const pidLen = 19
  const seqLen = 19
  return t + repeat('0', pidLen + seqLen)
}
