// Native
import { homedir } from 'os';

import path from 'path';

// Packages
import mri from 'mri';

const getNowDir = () => {
  const args = mri(process.argv.slice(2), {
    string: ['global-config'],
    alias: {
      'global-config': 'Q'
    }
  });

  const customPath = args['global-config'];

  if (!customPath) {
    return path.join(homedir(), '.now');
  }

  return path.resolve(customPath);
};

export default getNowDir;
