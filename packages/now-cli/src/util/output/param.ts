import chalk from 'chalk';

export default function param(text: string) {
  return `${chalk.gray('"')}${chalk.bold(text)}${chalk.gray('"')}`;
}
