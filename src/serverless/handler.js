// @flow
const start = new Date()

const { createServer } = require('http')
const { createConnection } = require('net')
const { spawn } = require('child_process')
const request = require('http').request

let spawned = false
let PORT = null
let retriesLeft = 20
let buffer = []

const flushBuffer = () => {
  buffer.forEach(args => {
    proxyRequest.apply(null, args)
  })
  buffer = null
}

const findFreePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer(() => {}).listen(err => {
      if (err) return reject(err)
      const { port } = srv.address()
      srv.close()
      resolve(port)
    })
  })

findFreePort().then(
  port => {
    PORT = port

    const env = Object.assign({}, process.env, {
      // we need to add `/nodejs/bin` for GCP functions to
      // work correctly
      PATH: `/nodejs/bin:/usr/local/bin:/usr/bin`,
      PORT
    })

    const NOW_CMD = [
      /*NOW_CMD*/
    ][0]

    const NOW_SCRIPT = [
      /*NOW_SCRIPT*/
    ][0]

    if (NOW_CMD) {
      const cmd = spawn('/usr/bin/env', ['sh', '-c', NOW_CMD], { env: env })
      cmd.on('error', err => {
        throw err
      })
    } else {
      process.env.PORT = PORT
      require(`./${NOW_SCRIPT}`)
    }

    const attemptConnect = () => {
      const socket = createConnection(PORT)
      socket.setTimeout(1000)
      socket.on('error', retry)
      socket.on('connect', () => {
        socket.end()
        spawned = true
        flushBuffer()
        console.log('spawn took', new Date() - start)
      })
      socket.on('timeout', () => {
        socket.end()
        retry()
      })
    }

    const retry = () => {
      if (--retriesLeft < 0) {
        throw new Error('Could not establish a connection to the http server')
      }
      // this is close to the bootup time of the most minimal
      // node server that could be created
      setTimeout(attemptConnect, 80)
    }

    retry()
  },
  err => {
    throw err
  }
)

exports.handler = (...args) => {
  // hack for lambda. we will refactor the handler injection
  // per-provider later
  if (args[1] && args[1].callbackWaitsForEmptyEventLoop) {
    args[1].callbackWaitsForEmptyEventLoop = false
  }

  if (spawned) {
    proxyRequest.apply(null, args)
  } else {
    buffer.push(args)
  }
}

// we will replace the comment with the function with the logic
// to proxy the request for every provider
const proxyRequest = [
  /*PROXY_REQUEST_SOURCE*/
][0].bind(null, request, () => PORT)
