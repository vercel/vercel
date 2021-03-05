import { cyan } from 'chalk';
import chars from './chars';

const ok = msg => `${cyan(chars.tick)} ${msg}`;

export default ok;
