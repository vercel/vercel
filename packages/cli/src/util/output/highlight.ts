import chalk from 'chalk';

export default function highlight(text: string): string {
  return chalk.bold.underline(text);
}