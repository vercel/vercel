import os from 'os';
import pkg from './pkg';

export default `${pkg.name} ${pkg.version} node-${
  process.version
} ${os.platform()} (${os.arch()})`;
