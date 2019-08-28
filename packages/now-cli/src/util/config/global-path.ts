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
  head(xdg.dataDirs()) || homeConfigPath,
  'now'
);

// Returns whether a directory exists
const isDirectory = (path: string): boolean => {
  try {
    return fs.lstatSync(path).isDirectory();
  } catch (_) {
    // We don't care which kind of error occured, it isn't a directory anyway.
    return false;
  }
};

// Returns in which directory the config should be present
const getNowDir = (): string => {
  const args = mri(process.argv.slice(2), {
    string: ['global-config'],
    alias: {
      'global-config': 'Q'
    }
  });

  const customPath = args['global-config'];

  // We use the customPath if it is available,
  // otherwise the config at the users home directory if it is present
  // and if nothing of this is there we use the XDG-standard
  return (
    (customPath && path.resolve(customPath)) ||
    (isDirectory(homeConfigPath) && homeConfigPath) ||
    xdgConfigPath
  );
};

export default getNowDir;
