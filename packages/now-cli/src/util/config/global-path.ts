// Native
import { homedir } from 'os';

import fs from 'fs';
import path from 'path';

// Packages
import mri from 'mri';
import XDGAppPaths from 'xdg-app-paths';

// The `homeConfigPath` is the legacy configuration path located in the users home directory.
const homeConfigPath: string = path.join(homedir(), '.now');

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
  const xdgConfigPaths = XDGAppPaths('now').dataDirs();
  const possibleConfigPaths = [homeConfigPath, ...xdgConfigPaths];

  // customPath is the preferred location
  // the legacy home directory config path is the second most wanted location
  // otherwise the first matching xdg-config-path is used which already exists
  // at last the first best xdg-config-path is used
  return (
    (customPath && path.resolve(customPath)) ||
    possibleConfigPaths.find(configPath => isDirectory(configPath)) ||
    xdgConfigPaths[0]
  );
};

export default getNowDir;
