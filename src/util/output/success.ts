import chalk from 'chalk';

export default function success (msg: string): string {
  return `${chalk.cyan('> Success!')} ${msg}`;
}
