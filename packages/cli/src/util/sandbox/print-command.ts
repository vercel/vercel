import chalk from 'chalk';

export function printCommand(command: string, args: string[]) {
  return chalk.gray(chalk.dim('$ ') + [command, ...args].join(' '));
}
