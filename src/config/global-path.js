// Native
const { homedir } = require('os');
const path = require('path');

// Packages
const mri = require('mri');

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

module.exports = getNowDir;
