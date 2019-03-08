import { red } from 'chalk';

const error = msg => `${red('> Aborted!')} ${msg}`;

export default error;
