import chalk from 'chalk';

// info('woot') === '> woot'
// info('woot', 'yay') === 'woot\nyay'
export default function info(...msgs: string[]) {
  return `${chalk.gray('>')} ${msgs.join('\n')}`;
}
