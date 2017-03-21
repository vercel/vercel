// Native
const EventEmitter = require('events');

// Packages
const ansi = require('ansi-escapes');
const io = require('socket.io-client');
const chalk = require('chalk');

const { compare, deserialize } = require('./logs');

class Lines {
  constructor(maxLines = 100) {
    this.max = maxLines;
    this.buf = [];
  }

  write(str) {
    const { max, buf } = this;

    if (buf.length === max) {
      process.stdout.write(ansi.eraseLines(max + 1));
      buf.shift();
      buf.forEach(line => console.log(line));
    }

    buf.push(str);
    console.log(str);
  }

  reset() {
    this.buf = [];
  }
}

module.exports = class Logger extends EventEmitter {
  constructor(host, { debug = false, quiet = false } = {}) {
    super();
    this.host = host;
    this.debug = debug;
    this.quiet = quiet;

    // ReadyState
    this.building = false;

    this.socket = io(`https://io.now.sh/states?host=${host}&v=2`);
    this.socket.once('error', this.onSocketError.bind(this));
    this.socket.on('state', this.onState.bind(this));
    this.socket.on('logs', this.onLog.bind(this));
    this.socket.on('backend', this.onComplete.bind(this));

    this.lines = new Lines(10);

    // Log buffer
    this.buf = [];
  }

  onState(state) {
    // Console.log(state)
    if (!state.id) {
      console.error('> Deployment not found');
      this.emit('error');
      return;
    }

    if (state.error) {
      this.emit('error', state);
      return;
    }

    if (state.backend) {
      this.onComplete();
      return;
    }

    if (state.logs) {
      state.logs.forEach(this.onLog, this);
    }
  }

  onLog(log) {
    if (!this.building) {
      if (!this.quiet) {
        console.log('> Building');
      }
      this.building = true;
    }

    if (this.quiet) {
      return;
    }

    log = deserialize(log);

    const timer = setTimeout(
      () => {
        this.buf.sort((a, b) => compare(a.log, b.log));
        const idx = this.buf.findIndex(b => b.log.id === log.id) + 1;
        for (const b of this.buf.slice(0, idx)) {
          clearTimeout(b.timer);
          this.printLog(b.log);
        }
        this.buf = this.buf.slice(idx);
      },
      300
    );

    this.buf.push({ log, timer });
  }

  onComplete() {
    this.socket.disconnect();

    if (this.building) {
      this.building = false;
    }

    this.buf.sort((a, b) => compare(a.log, b.log));

    // Flush all buffer
    for (const b of this.buf) {
      clearTimeout(b.timer);
      this.printLog(b.log);
    }
    this.buf = [];

    this.emit('close');
  }

  onSocketError(err) {
    if (this.debug) {
      console.log(`> [debug] Socket error ${err}\n${err.stack}`);
    }
  }

  printLog(log) {
    const data = log.object ? JSON.stringify(log.object) : log.text;

    if (log.type === 'command') {
      console.log(`${chalk.gray('>')} ▲ ${data}`);
      this.lines.reset();
    } else if (log.type === 'stderr') {
      data.split('\n').forEach(v => {
        if (v.length > 0) {
          console.error(chalk.gray(`> ${v}`));
        }
      });
      this.lines.reset();
    } else if (log.type === 'stdout') {
      data.split('\n').forEach(v => {
        if (v.length > 0) {
          this.lines.write(`${chalk.gray('>')} ${v}`);
        }
      });
    }
  }
};
