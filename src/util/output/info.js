import chalk from 'chalk';

// info('woot') === '> woot'
// info('woot', 'yay') === 'woot\nyay'
const info = (...msgs) => `${chalk.gray('>')} ${msgs.join('\n')}`;

export default info;
