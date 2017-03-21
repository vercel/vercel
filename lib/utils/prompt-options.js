// Packages
const chalk = require('chalk');

module.exports = function(opts) {
  return new Promise((resolve, reject) => {
    opts.forEach(([, text], i) => {
      console.log(`${chalk.gray('>')} [${chalk.bold(i + 1)}] ${text}`);
    });

    const ondata = v => {
      const s = v.toString();

      const cleanup = () => {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', ondata);
      };

      if (s === '\u0003') {
        cleanup();
        reject(new Error('Aborted'));
        return;
      }

      const n = Number(s);
      if (opts[n - 1]) {
        cleanup();
        resolve(opts[n - 1][0]);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', ondata);
  });
};
