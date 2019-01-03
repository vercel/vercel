const path = require('path');
const fs = require('fs-extra');

const prod = process.env.AWS_EXECUTION_ENV || process.env.X_GOOGLE_CODE_LOCATION;
const TMP_PATH = prod ? '/tmp' : path.join(__dirname, 'tmp');

module.exports = async function getWritableDirectory() {
  const name = Math.floor(Math.random() * 0x7fffffff).toString(16);
  const directory = path.join(TMP_PATH, name);
  await fs.mkdirp(directory);
  return directory;
};
