import { gray, bold } from 'chalk';

const param = text => `${gray('"')}${bold(text)}${gray('"')}`;

export default param;
