import chalk from 'chalk';
import * as ansiEscapes from 'ansi-escapes';
import { supportsHyperlink as detectSupportsHyperlink } from 'supports-hyperlinks';
import renderLink from './link';
import wait, { StopSpinner } from './wait';
import type { WritableTTY } from '../../types';
import { errorToString } from '../is-error';

export interface OutputOptions {
  debug?: boolean;
  supportsHyperlink?: boolean;
}

export interface LogOptions {
  color?: typeof chalk;
}

interface LinkOptions {
  fallback?: false | (() => string);
}

export class Output {
  stream: WritableTTY;
  debugEnabled: boolean;
  supportsHyperlink: boolean;
  private spinnerMessage: string;
  private _spinner: StopSpinner | null;

  constructor(
    stream: WritableTTY,
    {
      debug: debugEnabled = false,
      supportsHyperlink = detectSupportsHyperlink(stream),
    }: OutputOptions = {}
  ) {
    this.stream = stream;
    this.debugEnabled = debugEnabled;
    this.supportsHyperlink = supportsHyperlink;
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
    action: string = 'Learn More'
  ) => {
    const details = slug ? `https://err.sh/vercel/${slug}` : link;

    this.print(
      chalk.yellow(
        chalk.bold('WARN! ') +
          str +
          (details
            ? `\n${this.link(action, details, {
                fallback: () => `${action}: ${renderLink(details)}`,
              })}`
            : '')
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
      this.print(
        `${this.link(action, details, {
          fallback: () => `${chalk.bold(action)}: ${renderLink(details)}`,
        })}\n`
      );
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
    this.spinnerMessage = message;
    if (this.debugEnabled) {
      this.debug(`Spinner invoked (${message}) with a ${delay}ms delay`);
      return;
    }
    if (this.stream.isTTY) {
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
    } else {
      this.print(`${message}\n`);
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

  /**
   * Returns an ANSI formatted hyperlink when support has been enabled.
   */
  link = (
    text: string,
    url: string,
    { fallback }: LinkOptions = {}
  ): string => {
    // Credit: https://github.com/sindresorhus/terminal-link

    if (!this.supportsHyperlink) {
      // If the fallback has been explicitly disabled, don't modify the text itself
      if (fallback === false) {
        return renderLink(text);
      }

      return typeof fallback === 'function'
        ? fallback()
        : `${text} (${renderLink(url)})`;
    }

    return ansiEscapes.link(chalk.cyan(text), url);
  };
}
