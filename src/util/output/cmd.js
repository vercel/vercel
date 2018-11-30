import { gray, cyan } from 'chalk';

const cmd = text => `${gray('`')}${cyan(text)}${gray('`')}`;

export default cmd;
