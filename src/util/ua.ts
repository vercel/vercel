import os from 'os';
import pkg from './pkg';

export default `now ${pkg.version} node-${process.version} ${os.platform()} (${os.arch()})`;
