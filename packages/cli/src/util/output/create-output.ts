import chalk from 'chalk';
import renderLink from './link';
import wait, { StopSpinner } from './wait';
import type { WritableTTY } from '../../types';
import { errorToString } from '../is-error';

const IS_TEST = process.env.NODE_ENV === 'test';

export interface OutputOptions {
  debug?: boolean;
}

export interface LogOptions {
  color?: typeof chalk;
}

export class Output {
  stream: WritableTTY;
  debugEnabled: boolean;
  private spinnerMessage: string;
  private _spinner: StopSpinner | null;

  constructor(
    stream: WritableTTY,
    { debug: debugEnabled = false }: OutputOptions = {}
  ) {
    this.stream = stream;
    this.debugEnabled = debugEnabled;
    this.spinnerMessage = '';
    this._spinner = null;
  }

  isDebugEnabled = () => {
    return this.debugEnabled;
  };

  print = (str: string) => {
    this.stopSpinner();
    this.stream.write(str);
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
    action: string | null = 'Learn More'
  ) => {
    const details = slug ? `https://err.sh/vercel/${slug}` : link;

    this.print(
      chalk.yellow(
        chalk.bold('WARN! ') +
          str +
          (details ? `\n${action}: ${renderLink(details)}` : '')
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
    this.print(`${chalk.red(`Error:`)} ${str}\n`);
    const details = slug ? `https://err.sh/vercel/${slug}` : link;
    if (details) {
      this.print(`${chalk.bold(action)}: ${renderLink(details)}\n`);
    }
  };

  prettyError = (err: unknown) => {
    return this.error(
      errorToString(err),
      undefined,
      (err as any).link,
      (err as any).action
    );
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
    if (this.debugEnabled) {
      this.debug(`Spinner invoked (${message}) with a ${delay}ms delay`);
      return;
    }
    if (IS_TEST || !this.stream.isTTY) {
      this.print(`${message}\n`);
    } else {
      this.spinnerMessage = message;

      if (this._spinner) {
        this._spinner.text = message;
      } else {
        this._spinner = wait(
          {
            text: message,
            stream: this.stream,
          },
          delay
        );
      }
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
