const chalk = require('chalk');

module.exports = (
  label,
  {
    defaultValue = false,
    abortSequences = new Set(['\u0003']),
    resolveChars = new Set(['\r']),
    yesChar = 'y',
    noChar = 'n',
    stdin = process.stdin,
    stdout = process.stdout,
    trailing = '\n'
  } = {}
) => {
  return new Promise((resolve, reject) => {
    const isRaw = process.stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();

    function restore() {
      console.log(trailing);
      stdin.setRawMode(isRaw);
      stdin.pause();
      stdin.removeListener('data', onData);
    }

    function onData(buffer) {
      const data = buffer.toString();

      if (abortSequences.has(data)) {
        restore();
        return reject(new Error('USER_ABORT'));
      }

      if (resolveChars.has(data[0])) {
        restore();
        resolve(defaultValue);
      } else if (data[0].toLowerCase() === yesChar) {
        restore();
        resolve(true);
      } else if (data[0].toLowerCase() === noChar) {
        restore();
        resolve(false);
      } else {
        // ignore extraneous input
      }
    }

    const defaultText = defaultValue === null
      ? `[${yesChar}|${noChar}]`
      : defaultValue
          ? `[${chalk.bold(yesChar.toUpperCase())}|${noChar}]`
          : `[${yesChar}|${chalk.bold(noChar.toUpperCase())}]`;
    stdout.write(`${chalk.gray('-')} ${label} ${chalk.gray(defaultText)} `);
    stdin.on('data', onData);
  });
};
