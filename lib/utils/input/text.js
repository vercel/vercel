const ansiEscapes = require('ansi-escapes');
const ansiRegex = require('ansi-regex');
const chalk = require('chalk');
const stripAnsi = require('strip-ansi');

const ESCAPES = {
  LEFT: '\x1b[D',
  RIGHT: '\x1b[C',
  CTRL_C: '\x03',
  BACKSPACE: '\x08',
  CTRL_H: '\x7f',
  CARRIAGE: '\r'
};

module.exports = function(
  {
    label = '',
    initialValue = '',
    // can be:
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
    // char to print before resolving/rejecting the promise
    // if `false`, nothing will be printed
    trailing = ansiEscapes.eraseLines(1),
    // gets called on each keypress;
    // `data` contains the current keypress;
    // `futureValue` contains the current value + the
    // keypress in the correct place
    validateKeypress = (data, futureValue) => true, // eslint-disable-line no-unused-vars
    // get's called before the promise is resolved
    // returning `false` here will prevent the user from submiting the value
    validateValue = data => true, // eslint-disable-line no-unused-vars
    // receives the value of the input and should return a string
    // or false if no autocomplion is available
    autoComplete = value => false, // eslint-disable-line no-unused-vars
    // tab
    // right arrow
    autoCompleteChars = new Set(['\t', '\x1b[C'])
  } = {}
) {
  return new Promise((resolve, reject) => {
    const isRaw = process.stdin.isRaw;

    let value;
    let caretOffset = 0;
    let regex;
    let suggestion = '';

    stdout.write(label);
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
        .reduce(
          (prev, curr) => {
            if (curr !== ' ' && !prev.includes(curr)) {
              if (curr === '/') {
                prev.push(' / ');
              } else {
                prev.push(curr);
              }
            }
            return prev;
          },
          []
        )
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
      const data = buffer.toString();
      value = stripAnsi(value);

      if (abortSequences.has(data)) {
        restore();
        return reject(new Error('USER_ABORT'));
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
            value = value.substr(0, value.length + caretOffset - 2) +
              char +
              value.substr(value.length + caretOffset - 1);
            caretOffset--;
          } else {
            char = placeholder[value.length + caretOffset - 1];
            value = value.substr(0, value.length + caretOffset - 1) +
              char +
              value.substr(value.length + caretOffset);
          }
          caretOffset--;
        } else {
          value = value.substr(0, value.length + caretOffset - 1) +
            value.substr(value.length + caretOffset);
        }
        suggestion = '';
      } else if (resolveChars.has(data)) {
        if (validateValue(value)) {
          restore();
          resolve(value);
        } else {
          if (mask === 'cc' || mask === 'ccv') {
            value = value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
            value = value.replace(regex, chalk.gray('$1'));
          } else if (mask === 'expDate') {
            value = value.replace(regex, chalk.gray('$1'));
          }
          const l = chalk.red(label.replace('-', '✖'));
          stdout.write(
            ansiEscapes.eraseLines(1) + l + value + ansiEscapes.beep
          );
          if (caretOffset) {
            process.stdout.write(
              ansiEscapes.cursorBackward(Math.abs(caretOffset))
            );
          }
        }
        return;
      } else if (!ansiRegex().test(data)) {
        let tmp = value.substr(0, value.length + caretOffset) +
          data +
          value.substr(value.length + caretOffset);

        if (mask) {
          if (/\d/.test(data) && caretOffset !== 0) {
            if (value[value.length + caretOffset + 1] === ' ') {
              tmp = value.substr(0, value.length + caretOffset) +
                data +
                value.substr(value.length + caretOffset + 1);
              caretOffset += 2;
              if (value[value.length + caretOffset] === '/') {
                caretOffset += 2;
              }
            } else {
              tmp = value.substr(0, value.length + caretOffset) +
                data +
                value.substr(value.length + caretOffset + 1);
              caretOffset++;
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
        value = value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
        value = value.replace(regex, chalk.gray('$1'));
      } else if (mask === 'expDate') {
        value = value.replace(regex, chalk.gray('$1'));
      }

      stdout.write(ansiEscapes.eraseLines(1) + label + value + suggestion);
      if (caretOffset) {
        process.stdout.write(ansiEscapes.cursorBackward(Math.abs(caretOffset)));
      }
    }

    stdin.on('data', onData);
  });
};
