import chalk from 'chalk';

export default (
  label,
  {
    defaultValue = false,
    abortSequences = new Set(['\u0003']),
    resolveChars = new Set(['\r']),
    yesChar = 'y',
    noChar = 'n',
    stdin = process.stdin,
    stdout = process.stdout,
    trailing = ''
  } = {}
) => new Promise(resolve => {
    const isRaw = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();

    function restore() {
      stdout.write(trailing);
      stdin.setRawMode(isRaw);
      stdin.pause();
      stdin.removeListener('data', onData);
    }

    function onData(buffer) {
      const data = buffer.toString();

      if (data[0].toLowerCase() === yesChar) {
        restore();
        stdout.write(`\n`);
        resolve(true);
      } else if (data[0].toLowerCase() === noChar) {
        restore();
        resolve(false);
      } else if (abortSequences.has(data)) {
        restore();
        resolve(false);
      } else if (resolveChars.has(data[0])) {
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
    stdin.on('data', onData);
  });
