import chalk from 'chalk';
import boxen from 'boxen';
import { format } from 'util';
import { Console } from 'console';
import wait from './wait';

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
    const prevTerm = process.env.TERM;

    if (!prevTerm) {
      // workaround for https://github.com/sindresorhus/term-size/issues/13
      process.env.TERM = 'xterm';
    }

    print(
      boxen(
        chalk.bold.yellow('WARN! ') +
          str +
          (slug ? `\nMore details: https://err.sh/now/${slug}` : ''),
        {
          padding: {
            top: 0,
            bottom: 0,
            left: 1,
            right: 1,
          },
          borderColor: 'yellow',
        }
      )
    );
    print('\n');

    process.env.TERM = prevTerm;
  }

  function note(str: string) {
    log(chalk`{yellow.bold NOTE:} ${str}`);
  }

  function error(str: string, slug: string | null = null) {
    print(`${chalk.red(`Error!`)} ${str}\n`);
    if (slug !== null) {
      print(`More details: https://err.sh/now/${slug}\n`);
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

  function spinner(message: string, delay: number = 300) {
    if (debugEnabled) {
      debug(`Spinner invoked (${message}) with a ${delay}ms delay`);
      let isEnded = false;
      return () => {
        if (isEnded) return;
        isEnded = true;
        debug(`Spinner ended (${message})`);
      };
    }

    return wait(message, delay);
  }

  // This is pretty hacky, but since we control the version of Node.js
  // being used because of `pkg` it's safe to do in this case.
  const c = {
    _times: new Map(),
    log(a: string, ...args: string[]) {
      debug(format(a, ...args));
    },
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
    note,
    spinner,
  };
}
