import chalk from 'chalk';
import type { ReadableTTY, WritableTTY } from '../../types';

type Options = {
  abortSequences?: Set<string>;
  defaultValue?: boolean;
  noChar?: string;
  resolveChars?: Set<string>;
  stdin: ReadableTTY;
  stdout: WritableTTY;
  trailing?: string;
  yesChar?: string;
};

export default async function promptBool(label: string, options: Options) {
  const {
    stdin,
    stdout,
    defaultValue = false,
    abortSequences = new Set(['\u0003']),
    resolveChars = new Set(['\r']),
    yesChar = 'y',
    noChar = 'n',
    trailing = '',
  } = options;

  return new Promise<boolean>(resolve => {
    const isRaw = Boolean(stdin && stdin.isRaw);

    if (stdin) {
      if (stdin.setRawMode) {
        stdin.setRawMode(true);
      }

      stdin.resume();
    }

    function restore() {
      stdout.write(trailing);

      if (stdin) {
        if (stdin.setRawMode) {
          stdin.setRawMode(isRaw);
        }

        stdin.pause();
        stdin.removeListener('data', onData);
      }
    }

    function onData(buffer: Buffer) {
      const data = buffer.toString();
      if (data[0].toLowerCase() === yesChar) {
        restore();
        stdout.write(`\n`);
        resolve(true);
      } else if (data[0].toLowerCase() === noChar) {
        stdout.write(`\n`);
        restore();
        resolve(false);
      } else if (abortSequences.has(data)) {
        stdout.write(`\n`);
        restore();
        resolve(false);
      } else if (resolveChars.has(data[0])) {
        stdout.write(`\n`);
        restore();
        resolve(defaultValue);
      } else {
        // ignore extraneous input
      }
    }

    const defaultText =
      defaultValue === null
        ? `[${yesChar}|${noChar}]`
        : defaultValue
        ? `[${chalk.bold(yesChar.toUpperCase())}|${noChar}]`
        : `[${yesChar}|${chalk.bold(noChar.toUpperCase())}]`;
    stdout.write(`${chalk.gray('>')} ${label} ${chalk.gray(defaultText)} `);

    if (stdin) {
      stdin.on('data', onData);
    }
  });
}
