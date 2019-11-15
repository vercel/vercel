import chalk from 'chalk';
import ansiEscapes from 'ansi-escapes';
// @ts-ignore
import ansiRegex from 'ansi-regex';
// @ts-ignore
import stripAnsi from 'strip-ansi';
import eraseLines from '../output/erase-lines';

const ESCAPES = {
  LEFT: '\u001B[D',
  RIGHT: '\u001B[C',
  CTRL_C: '\u0003',
  BACKSPACE: '\u0008',
  CTRL_H: '\u007F',
  CARRIAGE: '\r',
};

const formatCC = (data: string) =>
  data
    .replace(/\s/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();

declare type TextParams = {
  label?: string;
  initialValue?: string;
  valid?: boolean;
  mask?: boolean | 'cc' | 'ccv' | 'expDate' | 'date';
  placeholder?: string;
  abortSequences?: Set<string>;
  eraseSequences?: Set<string>;
  resolveChars?: Set<string>;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  trailing?: string;
  validateKeypress?: (data: any, futureValue: string) => boolean;
  validateValue?: (data: string) => boolean;
  autoComplete?: (value: string) => string | false;
  autoCompleteChars?: Set<string>;
  forceLowerCase?: boolean;
};

export default function text({
  label = '',
  initialValue = '',
  // If false, the `- label` will be printed as `✖ label` in red
  // Until the first keypress
  valid = true,
  // Can be:
  // - `false`, which does nothing
  // - `cc`, for credit cards
  // - `date`, for dates in the mm / yyyy format
  mask = false,
  placeholder = '',
  abortSequences = new Set(['\x03']),
  eraseSequences = new Set([ESCAPES.BACKSPACE, ESCAPES.CTRL_H]),
  resolveChars = new Set([ESCAPES.CARRIAGE]),
  stdin = process.stdin,
  stdout = process.stdout,
  // Char to print before resolving/rejecting the promise
  // If `false`, nothing will be printed
  trailing = ansiEscapes.eraseLines(1),
  // Gets called on each keypress;
  // `data` contains the current keypress;
  // `futureValue` contains the current value + the
  // Keypress in the correct place
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateKeypress = (data, futureValue) => true, // eslint-disable-line no-unused-vars
  // Get's called before the promise is resolved
  // Returning `false` here will prevent the user from submiting the value
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateValue = (data: string) => true, // eslint-disable-line no-unused-vars
  // Receives the value of the input and should return a string
  // Or false if no autocomplion is available
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  autoComplete = (value: string) => false, // eslint-disable-line no-unused-vars
  // Tab
  // Right arrow
  autoCompleteChars = new Set(['\t', '\x1b[C']),
  // If true, converts everything the user types to to lowercase
  forceLowerCase = false,
}: TextParams = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const isRaw = process.stdin.isRaw || false;

    let value: string;
    let caretOffset = 0;
    let regex: RegExp;
    let suggestion = '';

    if (valid) {
      stdout.write(label);
    } else {
      const _label = label.replace('-', '✖');
      stdout.write(chalk.red(_label));
    }

    value = initialValue;
    stdout.write(initialValue);

    if (mask) {
      if (!value) {
        value = chalk.gray(placeholder);
        caretOffset = 0 - stripAnsi(value).length;
        stdout.write(value);
        stdout.write(ansiEscapes.cursorBackward(Math.abs(caretOffset)));
      }

      const regexStr = placeholder
        .split('')
        .reduce((prev: string[], curr) => {
          if (curr !== ' ' && !prev.includes(curr)) {
            if (curr === '/') {
              prev.push(' / ');
            } else {
              prev.push(curr);
            }
          }
          return prev;
        }, [])
        .join('|');
      regex = new RegExp(`(${regexStr})`, 'g');
    }

    if (stdin) {
      if (stdin.setRawMode) {
        stdin.setRawMode(true);
      }

      stdin.resume();
    }

    function restore() {
      if (stdin) {
        if (stdin.setRawMode) {
          stdin.setRawMode(isRaw);
        }

        stdin.pause();
        stdin.removeListener('data', onData);
      }

      if (trailing) {
        stdout.write(trailing);
      }
    }

    async function onData(buffer: Buffer) {
      let data = buffer.toString();

      value = stripAnsi(value);

      if (abortSequences.has(data)) {
        restore();
        const error = new Error('USER_ABORT');
        return reject(error);
      }

      if (forceLowerCase) {
        data = data.toLowerCase();
      }

      if (suggestion !== '' && !caretOffset && autoCompleteChars.has(data)) {
        value += stripAnsi(suggestion);
        suggestion = '';
      } else if (data === ESCAPES.LEFT) {
        if (value.length > Math.abs(caretOffset)) {
          caretOffset--;
        }
      } else if (data === ESCAPES.RIGHT) {
        if (caretOffset < 0) {
          caretOffset++;
        }
      } else if (eraseSequences.has(data)) {
        let char;
        if (mask && value.length > Math.abs(caretOffset)) {
          if (value[value.length + caretOffset - 1] === ' ') {
            if (value[value.length + caretOffset - 2] === '/') {
              caretOffset -= 1;
            }
            char = placeholder[value.length + caretOffset];
            value =
              value.substr(0, value.length + caretOffset - 2) +
              char +
              value.substr(value.length + caretOffset - 1);
            caretOffset--;
          } else {
            char = placeholder[value.length + caretOffset - 1];
            value =
              value.substr(0, value.length + caretOffset - 1) +
              char +
              value.substr(value.length + caretOffset);
          }
          caretOffset--;
        } else {
          value =
            value.substr(0, value.length + caretOffset - 1) +
            value.substr(value.length + caretOffset);
        }
        suggestion = '';
      } else if (resolveChars.has(data)) {
        if (validateValue(value)) {
          restore();
          resolve(value);
        } else {
          if (mask === 'cc' || mask === 'ccv') {
            value = formatCC(value);
            value = value.replace(regex, chalk.gray('$1'));
          } else if (mask === 'expDate') {
            value = value.replace(regex, chalk.gray('$1'));
          }

          const l = chalk.red(label.replace('-', '✖'));
          stdout.write(eraseLines(1));
          stdout.write(l + value + ansiEscapes.beep);
          if (caretOffset) {
            process.stdout.write(
              ansiEscapes.cursorBackward(Math.abs(caretOffset))
            );
          }
        }
        return;
      } else if (!ansiRegex().test(data)) {
        let tmp =
          value.substr(0, value.length + caretOffset) +
          data +
          value.substr(value.length + caretOffset);

        if (mask) {
          if (/\d/.test(data) && caretOffset !== 0) {
            let formattedData = data;

            if (mask === 'cc' || mask === 'ccv') {
              formattedData = formatCC(data);
            }

            if (value[value.length + caretOffset + 1] === ' ') {
              tmp =
                value.substr(0, value.length + caretOffset) +
                formattedData +
                value.substr(value.length + caretOffset + formattedData.length);

              caretOffset += formattedData.length + 1;

              if (value[value.length + caretOffset] === '/') {
                caretOffset += formattedData.length + 1;
              }
            } else {
              tmp =
                value.substr(0, value.length + caretOffset) +
                formattedData +
                value.substr(value.length + caretOffset + formattedData.length);

              caretOffset += formattedData.length;
            }
          } else if (/\s/.test(data) && caretOffset < 0) {
            caretOffset++;
            tmp = value;
          } else {
            return stdout.write(ansiEscapes.beep);
          }
          value = tmp;
        } else if (validateKeypress(data, value)) {
          value = tmp;
          if (caretOffset === 0) {
            const completion = await autoComplete(value);
            if (completion) {
              suggestion = chalk.gray(completion);
              suggestion += ansiEscapes.cursorBackward(completion.length);
            } else {
              suggestion = '';
            }
          }
        } else {
          return stdout.write(ansiEscapes.beep);
        }
      }

      if (mask === 'cc' || mask === 'ccv') {
        value = formatCC(value);
        value = value.replace(regex, chalk.gray('$1'));
      } else if (mask === 'expDate') {
        value = value.replace(regex, chalk.gray('$1'));
      }

      stdout.write(eraseLines(1));
      stdout.write(label + value + suggestion);
      if (caretOffset) {
        process.stdout.write(ansiEscapes.cursorBackward(Math.abs(caretOffset)));
      }
    }

    if (stdin) {
      stdin.on('data', onData);
    }
  });
}
