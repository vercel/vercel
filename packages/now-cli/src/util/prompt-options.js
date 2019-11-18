import chalk from 'chalk';

export default promptOptions;

function promptOptions(opts) {
  return new Promise((resolve, reject) => {
    opts.forEach(([, text], i) => {
      console.log(`${chalk.gray('>')} [${chalk.bold(i + 1)}] ${text}`);
    });

    const ondata = v => {
      const s = v.toString();

      const cleanup = () => {
        if (process.stdin) {
          if (process.stdin.setRawMode) {
            process.stdin.setRawMode(false);
          }

          process.stdin.removeListener('data', ondata);
          process.stdin.pause();
        }
      };

      // Ctrl + C
      if (s === '\u0003') {
        cleanup();
        const err = new Error('Aborted');
        err.code = 'USER_ABORT';
        return reject(err);
      }

      const n = Number(s);

      if (opts[n - 1]) {
        cleanup();
        resolve(opts[n - 1][0]);
      }
    };

    if (process.stdin) {
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }

      process.stdin.resume();
      process.stdin.on('data', ondata);
    }
  });
}
