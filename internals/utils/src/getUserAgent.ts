import os from 'os';
import { PackageJson } from '@vercel/build-utils';

export const getUserAgent = (packageJSON: PackageJson) => {
  return `${packageJSON.name} ${packageJSON.version} node-${
    process.version
  } ${os.platform()} (${os.arch()})`;
}
