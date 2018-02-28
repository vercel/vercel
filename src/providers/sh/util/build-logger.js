// Native
const EventEmitter = require('events')

// Packages
const io = require('socket.io-client')
const createOutput = require('../../../util/output')

const { compare, deserialize } = require('./logs')

module.exports = class Logger extends EventEmitter {
  constructor(host, token, { debug = false, quiet = false } = {}) {
    super()

    this.host = host
    this.token = token
    this.debug = debug
    this.quiet = quiet
    this.output = createOutput({ debug })

    // ReadyState
    this.building = false

    this.socket = io(`https://io.now.sh/states?host=${host}&v=2`)
    this.socket.once('error', this.onSocketError.bind(this))
    this.socket.on('auth', this.onAuth.bind(this))
    this.socket.on('state', this.onState.bind(this))
    this.socket.on('logs', this.onLog.bind(this))
    this.socket.on('backend', this.onComplete.bind(this))

    // Log buffer
    this.buf = []
    this.printed = new Set()
  }

  onAuth(callback) {
    const { debug } = this.output
    debug('Authenticate')
    callback(this.token)
  }

  onState(state) {
    const { log } = this.output

    if (!state.id) {
      log('Deployment not found')
      this.emit('error')
      return
    }

    if (state.error) {
      this.emit('error', state)
      return
    }

    if (state.backend) {
      this.onComplete()
      return
    }

    if (state.logs) {
      state.logs.forEach(this.onLog, this)
    }
  }

  onLog(log) {
    if (!this.building) {
      if (!this.quiet) {
        this.output.log('Building')
      }
      this.building = true
    }

    if (this.quiet) {
      return
    }

    log = deserialize(log)

    const timer = setTimeout(() => {
      this.buf.sort((a, b) => compare(a.log, b.log))
      const idx = this.buf.findIndex(b => b.log.id === log.id) + 1
      for (const b of this.buf.slice(0, idx)) {
        clearTimeout(b.timer)
        this.printLog(b.log)
      }
      this.buf = this.buf.slice(idx)
    }, 500)

    this.buf.push({ log, timer })
  }

  onComplete() {
    this.socket.disconnect()

    if (this.building) {
      this.building = false
    }

    this.buf.sort((a, b) => compare(a.log, b.log))

    // Flush all buffer
    for (const b of this.buf) {
      clearTimeout(b.timer)
      this.printLog(b.log)
    }
    this.buf = []

    this.emit('close')
  }

  onSocketError(err) {
    if (this.debug) {
      this.output.debug(`Socket error ${err}\n${err.stack}`)
    }
  }

  printLog(log) {
    if (this.printed.has(log.id)) return

    this.printed.add(log.id)

    const data = log.object ? JSON.stringify(log.object) : log.text

    if (log.type === 'command') {
      this.output.log(`▲ ${data}`)
    } else if (log.type === 'stdout' || log.type === 'stderr') {
      data.split('\n').forEach(v => {
        if (v.length > 0) {
          // strip out the beginning `>` if there is one because
          // `log()` prepends its own and we don't want `> >`
          this.output.log(v.replace(/^> /, ''))
        }
      })
    }
  }
}
