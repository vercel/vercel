// Packages
import ansiEscapes from 'ansi-escapes';

import ansiRegex from 'ansi-regex';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

// Utilities
import eraseLines from '../output/erase-lines';

const ESCAPES = {
  LEFT: '\u001B[D',
  RIGHT: '\u001B[C',
  CTRL_C: '\u0003',
  BACKSPACE: '\u0008',
  CTRL_H: '\u007F',
  CARRIAGE: '\r'
};

const formatCC = data => data
    .replace(/\s/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();

export default function(
  {
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
    validateKeypress = (data, futureValue) => true, // eslint-disable-line no-unused-vars
    // Get's called before the promise is resolved
    // Returning `false` here will prevent the user from submiting the value
    validateValue = data => true, // eslint-disable-line no-unused-vars
    // Receives the value of the input and should return a string
    // Or false if no autocomplion is available
    autoComplete = value => false, // eslint-disable-line no-unused-vars
    // Tab
    // Right arrow
    autoCompleteChars = new Set(['\t', '\x1b[C']),
    // If true, converts everything the user types to to lowercase
    forceLowerCase = false
  } = {}
) {
  return new Promise((resolve, reject) => {
    const isRaw = process.stdin.isRaw;

    let value;
    let caretOffset = 0;
    let regex;
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

      regex = placeholder
        .split('')
        .reduce((prev, curr) => {
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
      regex = new RegExp(`(${regex})`, 'g');
    }

    stdin.setRawMode(true);
    stdin.resume();

    function restore() {
      stdin.setRawMode(isRaw);
      stdin.pause();
      stdin.removeListener('data', onData);

      if (trailing) {
        stdout.write(trailing);
      }
    }

    async function onData(buffer) {
      let data = buffer.toString();

      value = stripAnsi(value);

      if (abortSequences.has(data)) {
        restore();
        return reject(new Error('USER_ABORT'));
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

    stdin.on('data', onData);
  });
};
