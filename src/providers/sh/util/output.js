const chalk = require('chalk');
const { format } = require('util');
const { Console } = require('console');

function createOutput({ debug: debugEnabled = false } = {}) {
  function print(v) {
    process.stderr.write(v);
  }

  function log(v, color = chalk.grey) {
    print(`${color('>')} ${v}\n`);
  }

  function warn(v) {
    log(chalk`{yellow.bold Warning!} ${v}`);
  }

  function error(v) {
    log(chalk`{red.bold Error!} ${v}`);
  }

  function debug(v) {
    if (debugEnabled) log(chalk`{bold [debug]} ${v}`);
  }

  // This is pretty hacky, but since we control the version of Node.js
  // being used because of `pkg` it's safe to do in this case.
  const c = {
    _times: new Map(),
    log(...args) { debug(format(...args)) }
  }

  function time(v) {
    if (debugEnabled) {
      Console.prototype.time.call(c, v);
      return () => Console.prototype.timeEnd.call(c, v);
    } else {
      return () => {};
    }
  }

  return {
    print,
    log,
    warn,
    error,
    debug,
    time
  };
}

module.exports = createOutput;
