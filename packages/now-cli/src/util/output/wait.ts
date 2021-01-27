import ora from 'ora';
import chalk from 'chalk';
import eraseLines from './erase-lines';

export interface StopSpinner {
  (): void;
  text: string;
}

export default function wait(
  msg: string,
  delay: number = 300,
  _ora = ora
): StopSpinner {
  let spinner: ReturnType<typeof _ora> | null = null;

  const timeout = setTimeout(() => {
    spinner = _ora(chalk.gray(msg));
    spinner.color = 'gray';
    spinner.start();
  }, delay);

  const stop = () => {
    clearTimeout(timeout);
    if (spinner) {
      spinner.stop();
      spinner = null;
      process.stderr.write(eraseLines(1));
    }
  };

  stop.text = msg;

  // Allow `text` property to update the text while the spinner is in action
  Object.defineProperty(stop, 'text', {
    get() {
      return msg;
    },

    set(v: string) {
      msg = v;
      if (spinner) {
        spinner.text = chalk.gray(v);
      }
    },
  });

  // @ts-ignore
  process.once('nowExit', stop);
  return stop;
}
