import chalk from 'chalk';
import chars from './chars';

const ok = (msg: string) => `${chalk.cyan(chars.tick)} ${msg}`;

export default ok;
