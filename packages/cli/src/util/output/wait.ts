import ora from 'ora';
import chalk from 'chalk';
import eraseLines from './erase-lines';

export interface StopSpinner {
  (): void;
  text: string;
}

export default function wait(
  opts: ora.Options,
  delay: number = 300
): StopSpinner {
  let text = opts.text;
  let spinner: ora.Ora | null = null;

  if (typeof text !== 'string') {
    throw new Error(`"text" is required for Ora spinner`);
  }

  const timeout = setTimeout(() => {
    spinner = ora(opts);
    spinner.text = chalk.gray(text);
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

  stop.text = text;

  // Allow `text` property to update the text while the spinner is in action
  Object.defineProperty(stop, 'text', {
    get() {
      return text;
    },

    set(v: string) {
      text = v;
      if (spinner) {
        spinner.text = chalk.gray(v);
      }
    },
  });

  return stop;
}
