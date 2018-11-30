import { gray } from 'chalk';

// info('woot') === '> woot'
// info('woot', 'yay') === 'woot\nyay'
const info = (...msgs) => `${gray('>')} ${msgs.join('\n')}`;

export default info;
