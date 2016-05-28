import os from 'os';
import { version } from '../package';

export default `now ${version} node-${process.version} ${os.platform()} (${os.arch()})`;
