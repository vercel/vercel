import chalk from 'chalk';
import chars from './chars.js';

const ok = (msg: string) => `${chalk.cyan(chars.tick)} ${msg}`;

export default ok;
