// Packages
const chalk = require('chalk')
const { eraseLines } = require('ansi-escapes')
const jsonlines = require('jsonlines')
const retry = require('async-retry')

// Utilities
const createOutput = require('../../../util/output')

function printEvent(log, type, text) {
  if (type === 'command') {
    log(`▲ ${text}`)
  } else if (type === 'stdout' || type === 'stderr') {
    text.split('\n').forEach(v => {
      // strip out the beginning `>` if there is one because
      // `log()` prepends its own and we don't want `> >`
      log(v.replace(/^> /, ''))
    })
  }
}

async function printEvents(now, deploymentIdOrURL, currentTeam = null, {
  onOpen = ()=>{}, quiet, debugEnabled
} = {}) {
  const { log, debug } = createOutput({ debug: debugEnabled })

  let onOpenCalled = false
  function callOnOpenOnce() {
    if (onOpenCalled) return
    onOpenCalled = true
    onOpen()
  }

  let pollUrl = `/v1/now/deployments/${deploymentIdOrURL}`
  let eventsUrl = `/v1/now/deployments/${deploymentIdOrURL}/events?follow=1`

  if (currentTeam) {
    eventsUrl += `&teamId=${currentTeam.id}`
  }

  debug(`Events ${eventsUrl}`)

  // we keep track of how much we log in case we
  // drop the connection and have to start over
  let o = 0

  await retry(async (bail, attemptNumber) => {
    if (attemptNumber > 1) {
      debug('Retrying events')
    }

    const eventsRes = await now._fetch(eventsUrl)
    if (eventsRes.ok) {
      const readable = await eventsRes.readable()

      // handle the event stream and make the promise get rejected
      // if errors occur so we can retry
      return new Promise((resolve, reject) => {
        const stream = readable.pipe(jsonlines.parse())

        let poller = (function startPoller() {
          return setTimeout(async () => {
            try {
              const pollRes = await now._fetch(pollUrl)
              if (!pollRes.ok) throw new Error(`Response ${pollRes.status}`)
              const json = await pollRes.json()
              if (json.state === 'READY') {
                cleanup()
                return
              }
              poller = startPoller()
            } catch (error) {
              cleanup(error)
            }
          }, 5000)
        })()

        let cleanupAndResolveCalled = false
        function cleanup(error) {
          if (cleanupAndResolveCalled) return
          cleanupAndResolveCalled = true
          callOnOpenOnce()
          if (!error) log(chalk`{cyan Success!} Build complete`)
          clearTimeout(poller)
          // avoid lingering events
          stream.removeListener('data', onData)
          // prevent partial json from being parsed and error emitted.
          // this can be reproduced by force placing stream.write('{{{') here
          stream._emitInvalidLines = true
          // close the stream and resolve
          stream.end()
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        }

        const onData = ({ type, event, text }) => {
          // if we are 'quiet' because we are piping, simply
          // wait for the first instance to be started
          // and ignore everything else
          if (quiet) {
            if (type === 'instance-start') {
              cleanup()
            }
            return
          }

          if (event === 'build-start') {
            o++
            callOnOpenOnce()
            log('Building…')
          } else
          if (event === 'build-complete') {
            cleanup()
          } else
          if ([ 'command', 'stdout', 'stderr' ].includes(type)) {
            if (text.slice(-1) === '\n') text = text.slice(0, -1)
            o += text.split('\n').length
            callOnOpenOnce()
            printEvent(log, type, text)
          }
        }

        stream.on('data', onData)
        stream.on('error', err => {
          o++
          callOnOpenOnce()
          log(`Deployment event stream error: ${err.message}`)
        })
      })
    } else {
      callOnOpenOnce()
      const err = new Error(`Deployment events status ${eventsRes.status}`)

      if (eventsRes.status < 500) {
        bail(err)
      } else {
        throw err
      }
    }
  }, {
    retries: 4,
    onRetry: (err) => {
      // if we are retrying, we clear past logs
      if (!quiet && o) {
        // o + 1 because current line is counted
        process.stdout.write(eraseLines(o + 1))
        o = 0
      }

      log(`Deployment state polling error: ${err.message}`)
    }
  })
}

module.exports = printEvents
