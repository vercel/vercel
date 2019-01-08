import chalk from 'chalk';

export default function success (msg: string) {
  return `${chalk.cyan('> Success!')} ${msg}`;
}
