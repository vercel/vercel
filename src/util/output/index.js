import chalk from 'chalk';
import { format } from 'util';
import { Console } from 'console';

function createOutput({ debug: debugEnabled = false } = {}) {
  function print(v) {
    process.stderr.write(v);
  }

  function log(v, color = chalk.grey) {
    print(`${color('>')} ${v}\n`);
  }

  function warn(v, slug = null) {
    log(chalk`{yellow.bold WARN!} ${v}`);
    if (slug !== null) {
      log(`More details: https://err.sh/now-cli/${slug}`);
    }
  }

  function note(v) {
    log(chalk`{yellow.bold NOTE:} ${v}`, chalk.yellow);
  }

  function error(v, slug = null) {
    log(chalk`{red.bold Error!} ${v}`, chalk.red);
    if (slug !== null) {
      log(`More details: https://err.sh/now-cli/${slug}`);
    }
  }

  function success(v) {
    print(`${chalk.cyan('> Success!')} ${v}\n`);
  }

  function debug(v) {
    if (debugEnabled) {
      log(
        `${chalk.bold('[debug]')} ${chalk.gray(
          `[${new Date().toISOString()}]`
        )} ${v}`
      );
    }
  }

  // This is pretty hacky, but since we control the version of Node.js
  // being used because of `pkg` it's safe to do in this case.
  const c = {
    _times: new Map(),
    log(...args) {
      debug(format(...args));
    }
  };

  async function time(label, fn) {
    const promise = !fn.then && typeof fn === 'function' ? fn() : fn;
    if (debugEnabled) {
      c.log(label);
      Console.prototype.time.call(c, label);
      const r = await promise;
      Console.prototype.timeEnd.call(c, label);
      return r;
    } 
      return promise;
    
  }

  return {
    print,
    log,
    warn,
    error,
    success,
    debug,
    time,
    note
  };
}

export default createOutput;
