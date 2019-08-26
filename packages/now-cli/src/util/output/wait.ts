import ora from 'ora';
import chalk from 'chalk';
import eraseLines from './erase-lines';

export default function wait(msg: string, timeout: number = 300, _ora = ora) {
  let spinner: ReturnType<typeof _ora>;
  let running = false;
  let stopped = false;

  setTimeout(() => {
    if (stopped) {
      return null;
    }

    spinner = _ora(chalk.gray(msg));
    spinner.color = 'gray';
    spinner.start();
    running = true;
  }, timeout);

  const cancel = () => {
    stopped = true;
    if (running) {
      spinner.stop();
      process.stderr.write(eraseLines(1));
      running = false;
    }
    process.removeListener('nowExit', cancel);
  };

  // @ts-ignore
  process.on('nowExit', cancel);
  return cancel;
}
