import ora2 from 'ora';
import chalk from 'chalk';
import eraseLines from './erase-lines';

const wait = (msg, timeOut = 300, ora = ora2) => {
  let running = false;
  let spinner;
  let stopped = false;

  setTimeout(() => {
    if (stopped) return;

    spinner = ora(chalk.gray(msg));
    spinner.color = 'gray';
    spinner.start();

    running = true;
  }, timeOut);

  const cancel = () => {
    stopped = true;
    if (running) {
      spinner.stop();
      process.stderr.write(eraseLines(1));
      running = false;
    }
    process.removeListener('nowExit', cancel);
  };

  process.on('nowExit', cancel);
  return cancel;
};

export default wait;
