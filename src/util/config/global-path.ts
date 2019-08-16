// Native
import { homedir } from 'os';
import fs from 'fs';
import path from 'path';

// Packages
import mri from 'mri';
import xdg from 'xdg-portable';
import head from 'lodash.head';

// The `homeConfigPath` is the legacy configuration path located in the users home directory.
const homeConfigPath: string = path.join(homedir(), '.now');

// The `xdgConfigPath` is the configuration path which is based on the XDG standard.
// the old legacy path is used as a fallback
const xdgConfigPath: string = path.join(
  process.env.XDG_DATA_HOME || (head(xdg.dataDirs()) || homeConfigPath),
  'now'
);

// Returns wether a directory exists
const isDirectory = (path: string): boolean => {
  try {
    return fs.lstatSync(path).isDirectory();
  } catch (e) {
    return false;
  }
};

const getNowDir = (): string => {
  const args = mri(process.argv.slice(2), {
    string: ['global-config'],
    alias: {
      'global-config': 'Q'
    }
  });

  const customPath = args['global-config'];
  if (customPath) {
    return path.resolve(customPath);
  }

  // legacy config exists
  if (isDirectory(homeConfigPath)) {
    return homeConfigPath;
  }

  return xdgConfigPath;
};

export default getNowDir;
