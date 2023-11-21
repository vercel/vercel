import os from 'node:os';
import pkg from './pkg.js';

export default `${pkg.name} ${pkg.version} node-${
  process.version
} ${os.platform()} (${os.arch()})`;
