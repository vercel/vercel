import chalk from 'chalk';
import { format } from 'util';
import { Console } from 'console';

export type Output = ReturnType<typeof createOutput>;

export default function createOutput({ debug: debugEnabled = false } = {}) {
  function print(str: string) {
    process.stderr.write(str);
  }

  function log(str: string, color = chalk.grey) {
    print(`${color('>')} ${str}\n`);
  }

  function dim(str: string, color = chalk.grey) {
    print(`${color(`> ${str}`)}\n`);
  }

  function warn(str: string, slug: string | null = null) {
    log(chalk`{yellow.bold WARN!} ${str}`);
    if (slug !== null) {
      log(`More details: https://err.sh/now/${slug}`);
    }
  }

  function note(str: string) {
    log(chalk`{yellow.bold NOTE:} ${str}`);
  }

  function error(str: string, slug: string | null = null) {
    log(chalk`{red.bold Error!} ${str}`, chalk.red);
    if (slug !== null) {
      log(`More details: https://err.sh/now/${slug}`);
    }
  }

  function ready(str: string) {
    print(`${chalk.cyan('> Ready!')} ${str}\n`);
  }

  function success(str: string) {
    print(`${chalk.cyan('> Success!')} ${str}\n`);
  }

  function debug(str: string) {
    if (debugEnabled) {
      log(
        `${chalk.bold('[debug]')} ${chalk.gray(
          `[${new Date().toISOString()}]`
        )} ${str}`
      );
    }
  }

  // This is pretty hacky, but since we control the version of Node.js
  // being used because of `pkg` it's safe to do in this case.
  const c = {
    _times: new Map(),
    log(a: string, ...args: string[]) {
      debug(format(a, ...args));
    }
  };

  async function time(label: string, fn: Promise<any> | (() => Promise<any>)) {
    const promise = typeof fn === 'function' ? fn() : fn;
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
    ready,
    success,
    debug,
    dim,
    time,
    note
  };
}
