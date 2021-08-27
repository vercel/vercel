import chalk from 'chalk';
import boxen from 'boxen';
import renderLink from './link';
import wait, { StopSpinner } from './wait';
import { Writable } from 'stream';

export interface OutputOptions {
  debug?: boolean;
}

export interface PrintOptions {
  w?: Writable;
}

export interface LogOptions extends PrintOptions {
  color?: typeof chalk;
}

export class Output {
  private debugEnabled: boolean;
  private spinnerMessage: string;
  private _spinner: StopSpinner | null;

  constructor({ debug: debugEnabled = false }: OutputOptions = {}) {
    this.debugEnabled = debugEnabled;
    this.spinnerMessage = '';
    this._spinner = null;
  }

  get isTTY() {
    return process.stdout.isTTY;
  }

  isDebugEnabled = () => {
    return this.debugEnabled;
  };

  print = (str: string, { w }: PrintOptions = { w: process.stderr }) => {
    this.stopSpinner();
    const stream: Writable = w || process.stderr;
    stream.write(str);
  };

  log = (str: string, color = chalk.grey) => {
    this.print(`${color('>')} ${str}\n`);
  };

  dim = (str: string, color = chalk.grey) => {
    this.print(`${color(`> ${str}`)}\n`);
  };

  warn = (
    str: string,
    slug: string | null = null,
    link: string | null = null,
    action: string | null = 'Learn More',
    options?: {
      boxen?: boxen.Options;
    }
  ) => {
    const details = slug ? `https://err.sh/vercel/${slug}` : link;

    this.print(
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
    this.print('\n');
  };

  note = (str: string) => {
    this.log(chalk`{yellow.bold NOTE:} ${str}`);
  };

  error = (
    str: string,
    slug?: string,
    link?: string,
    action = 'Learn More'
  ) => {
    this.print(`${chalk.red(`Error!`)} ${str}\n`);
    const details = slug ? `https://err.sh/vercel/${slug}` : link;
    if (details) {
      this.print(`${chalk.bold(action)}: ${renderLink(details)}\n`);
    }
  };

  prettyError = (
    err: Pick<Error, 'message'> & { link?: string; action?: string }
  ) => {
    return this.error(err.message, undefined, err.link, err.action);
  };

  ready = (str: string) => {
    this.print(`${chalk.cyan('> Ready!')} ${str}\n`);
  };

  success = (str: string) => {
    this.print(`${chalk.cyan('> Success!')} ${str}\n`);
  };

  debug = (str: string) => {
    if (this.debugEnabled) {
      this.log(
        `${chalk.bold('[debug]')} ${chalk.gray(
          `[${new Date().toISOString()}]`
        )} ${str}`
      );
    }
  };

  spinner = (message: string, delay: number = 300): void => {
    this.spinnerMessage = message;
    if (this.debugEnabled) {
      this.debug(`Spinner invoked (${message}) with a ${delay}ms delay`);
      return;
    }
    if (this._spinner) {
      this._spinner.text = message;
    } else {
      this._spinner = wait(message, delay);
    }
  };

  stopSpinner = () => {
    if (this.debugEnabled && this.spinnerMessage) {
      const msg = `Spinner stopped (${this.spinnerMessage})`;
      this.spinnerMessage = '';
      this.debug(msg);
    }
    if (this._spinner) {
      this._spinner();
      this._spinner = null;
      this.spinnerMessage = '';
    }
  };

  time = async <T>(
    label: string | ((r?: T) => string),
    fn: Promise<T> | (() => Promise<T>)
  ) => {
    const promise = typeof fn === 'function' ? fn() : fn;

    if (this.debugEnabled) {
      const startLabel = typeof label === 'function' ? label() : label;
      this.debug(startLabel);
      const start = Date.now();
      const r = await promise;
      const endLabel = typeof label === 'function' ? label(r) : label;
      const duration = Date.now() - start;
      const durationPretty =
        duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`;
      this.debug(`${endLabel} ${chalk.gray(`[${durationPretty}]`)}`);
      return r;
    }

    return promise;
  };
}

export default function createOutput(opts?: OutputOptions) {
  return new Output(opts);
}
