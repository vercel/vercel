import chalk from 'chalk';
import boxen from 'boxen';
import { format } from 'util';
import { Console } from 'console';
import renderLink from './link';
import wait, { StopSpinner } from './wait';

export type Output = ReturnType<typeof _createOutput>;

export interface OutputOptions {
  debug?: boolean;
}

// Singleton
let instance: Output | null = null;

export default function createOutput(opts?: OutputOptions) {
  if (!instance) {
    instance = _createOutput(opts);
  }
  return instance;
}

function _createOutput({ debug: debugEnabled = false }: OutputOptions = {}) {
  let spinnerMessage = '';
  let spinner: StopSpinner | null = null;

  function isDebugEnabled() {
    return debugEnabled;
  }

  function print(str: string) {
    stopSpinner();
    process.stderr.write(str);
  }

  function log(str: string, color = chalk.grey) {
    print(`${color('>')} ${str}\n`);
  }

  function dim(str: string, color = chalk.grey) {
    print(`${color(`> ${str}`)}\n`);
  }

  function warn(
    str: string,
    slug: string | null = null,
    link: string | null = null,
    action: string | null = 'Learn More',
    options?: {
      boxen?: boxen.Options;
    }
  ) {
    const details = slug ? `https://err.sh/vercel/${slug}` : link;

    print(
      boxen(
        chalk.bold.yellow('WARN! ') +
          str +
          (details ? `\n${action}: ${renderLink(details)}` : ''),
        {
          padding: {
            top: 0,
            bottom: 0,
            left: 1,
            right: 1,
          },
          borderColor: 'yellow',
          ...options?.boxen,
        }
      )
    );
    print('\n');
  }

  function note(str: string) {
    log(chalk`{yellow.bold NOTE:} ${str}`);
  }

  function error(
    str: string,
    slug?: string,
    link?: string,
    action = 'Learn More'
  ) {
    print(`${chalk.red(`Error!`)} ${str}\n`);
    const details = slug ? `https://err.sh/vercel/${slug}` : link;
    if (details) {
      print(`${chalk.bold(action)}: ${renderLink(details)}\n`);
    }
  }

  function prettyError(err: Error & { link?: string; action?: string }) {
    return error(err.message, undefined, err.link, err.action);
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

  function setSpinner(message: string, delay: number = 300): void {
    spinnerMessage = message;
    if (debugEnabled) {
      debug(`Spinner invoked (${message}) with a ${delay}ms delay`);
      return;
    }
    if (spinner) {
      spinner.text = message;
    } else {
      spinner = wait(message, delay);
    }
  }

  function stopSpinner() {
    if (debugEnabled && spinnerMessage) {
      const msg = `Spinner stopped (${spinnerMessage})`;
      spinnerMessage = '';
      debug(msg);
    }
    if (spinner) {
      spinner();
      spinner = null;
      spinnerMessage = '';
    }
  }

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
    isDebugEnabled,
    print,
    log,
    warn,
    error,
    prettyError,
    ready,
    success,
    debug,
    dim,
    time,
    note,
    spinner: setSpinner,
    stopSpinner,
  };
}
