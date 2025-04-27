import chalk, { type Chalk } from 'chalk';
import * as ansiEscapes from 'ansi-escapes';
import { supportsHyperlink as detectSupportsHyperlink } from 'supports-hyperlinks';
import renderLink from './link';
import wait, { type StopSpinner } from './wait';
import { errorToString } from '@vercel/error-utils';
import { removeEmoji } from '../emoji';
import type * as tty from 'tty';
import { inspect } from 'util';

const IS_TEST = process.env.NODE_ENV === 'test';

export interface OutputOptions {
  stream?: tty.WriteStream;
  debug?: boolean;
  supportsHyperlink?: boolean;
  noColor?: boolean;
}

export interface LogOptions {
  color?: Chalk;
}

export interface LinkOptions {
  color?: false | ((text: string) => string);
  fallback?: false | (() => string);
}

let defaultChalkColorLevel: chalk.Level = 0;

export class Output {
  stream!: tty.WriteStream;
  debugEnabled!: boolean;
  supportsHyperlink!: boolean;
  colorDisabled!: boolean;
  private spinnerMessage: string;
  private _spinner: StopSpinner | null;

  constructor(stream: tty.WriteStream, options: OutputOptions = {}) {
    this.spinnerMessage = '';
    this._spinner = null;

    this.initialize({
      ...options,
      stream,
    });
  }

  /**
   * Parts of the constructor logic that can be called again after construction
   * to change some values.
   */
  initialize({
    stream,
    debug: debugEnabled,
    supportsHyperlink,
    noColor,
  }: OutputOptions = {}) {
    if (stream !== undefined) {
      this.stream = stream;
    }

    if (debugEnabled !== undefined) {
      this.debugEnabled = debugEnabled;
    }

    if (supportsHyperlink === undefined) {
      this.supportsHyperlink = detectSupportsHyperlink(this.stream);
    } else {
      this.supportsHyperlink = supportsHyperlink;
    }

    if (noColor !== undefined) {
      this.colorDisabled = getNoColor(noColor);
      if (this.colorDisabled) {
        defaultChalkColorLevel = chalk.level;
        chalk.level = 0;
      } else {
        chalk.level = defaultChalkColorLevel;
      }
    }
  }

  isDebugEnabled = () => {
    return this.debugEnabled;
  };

  print = (str: string) => {
    if (this.colorDisabled) {
      str = removeEmoji(str);
    }
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

  debug = (debug: unknown) => {
    if (this.debugEnabled) {
      this.log(
        `${chalk.bold('[debug]')} ${chalk.gray(
          `[${new Date().toISOString()}]`
        )} ${debugToString(debug)}`
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

  /**
   * Returns an ANSI formatted hyperlink when support has been enabled.
   */
  link = (
    text: string,
    url: string,
    { fallback, color = chalk.cyan }: LinkOptions = {}
  ): string => {
    // Based on https://github.com/sindresorhus/terminal-link (MIT license)
    if (!this.supportsHyperlink) {
      // If the fallback has been explicitly disabled, don't modify the text itself
      if (fallback === false) {
        return renderLink(text);
      }

      return typeof fallback === 'function'
        ? fallback()
        : `${text} (${renderLink(url)})`;
    }

    return ansiEscapes.link(color ? color(text) : text, url);
  };
}

function getNoColor(noColorArg: boolean | undefined): boolean {
  // FORCE_COLOR: the standard supported by chalk https://github.com/chalk/chalk#supportscolor
  // NO_COLOR: the standard we want to support https://no-color.org/
  // noColorArg: the `--no-color` arg passed to the CLI command
  const noColor =
    process.env.FORCE_COLOR === '0' ||
    process.env.NO_COLOR === '1' ||
    noColorArg;
  return !!noColor;
}

function debugToString(debug: unknown): string {
  if (typeof debug === 'string') {
    return debug;
  }
  return inspect(debug);
}
