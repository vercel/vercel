import chalk from 'chalk';

export default function cmd(text: string) {
  return `${chalk.gray('`')}${chalk.cyan(text)}${chalk.gray('`')}`;
}
