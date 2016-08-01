import chalk from 'chalk';

export default function (opts) {
  return new Promise((resolve, reject) => {
    opts.forEach(([, text], i) => {
      console.log(`${chalk.gray('>')} [${chalk.bold(i + 1)}] ${text}`);
    });
    const ondata = (v) => {
      const s = v.toString();
      if ('\u0003' === s) {
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
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', ondata);
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', ondata);
  });
}
