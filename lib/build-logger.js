import ansi from 'ansi-escapes';
import io from 'socket.io-client';
import chalk from 'chalk';
import EventEmitter from 'events';

export default class Logger extends EventEmitter {

  constructor (host, { debug = false, quiet = false } = {}) {
    super();
    this.host = host;
    this.quiet = quiet;

    // readyState
    this.building = false;

    this.socket = io(`https://io.now.sh?host=${host}`);
    this.socket.once('error', this.onSocketError.bind(this));
    this.socket.on('state', this.onState.bind(this));
    this.socket.on('logs', this.onLog.bind(this));
    this.socket.on('backend', this.onComplete.bind(this));

    this.lines = new Lines(10);
  }

  onState (state) {
    if (!state.id) {
      console.error('> Deployment not found');
      this.emit('error');
      return;
    }

    if (state.error) {
      console.error('> Deployment error');
      this.emit('error');
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

  onLog (log) {
    if (!this.building) {
      if (!this.quiet) {
        console.log('> Building');
      }
      this.building = true;
    }

    if (this.quiet) return;

    if ('command' === log.type) {
      console.log(`${chalk.gray('>')} ▲ ${log.data}`);
      this.lines.reset();
    } else if ('stderr' === log.type) {
      log.data.split('\n').forEach((v) => {
        if (v.length) {
          console.error(chalk.red(`> ${v}`));
        }
      });
      this.lines.reset();
    } else if ('stdout' === log.type) {
      log.data.split('\n').forEach((v) => {
        if (v.length) {
          this.lines.write(`${chalk.gray('>')} ${v}`);
        }
      });
    }
  }

  onComplete () {
    this.socket.disconnect();

    if (this.building) {
      this.building = false;
    }

    this.emit('close');
  }

  onSocketError () {
    this.removeAllListeners();
    console.error('> Connection error');
    this.emit('error');
  }

}

class Lines {

  constructor (maxLines = 100) {
    this.max = maxLines;
    this.buf = [];
  }

  write (str) {
    const { max, buf } = this;

    if (buf.length === max) {
      process.stdout.write(ansi.eraseLines(max + 1));
      buf.shift();
      buf.forEach((line) => console.log(line));
    }

    buf.push(str);
    console.log(str);
  }

  reset () {
    this.buf = [];
  }

}
