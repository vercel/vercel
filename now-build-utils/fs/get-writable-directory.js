const path = require('path');
const fs = require('fs-extra');

const dev = !process.env.AWS_EXECUTION_ENV;
const TMP_PATH = dev ? path.join(process.cwd(), 'tmp') : '/tmp';

module.exports = async function getWritableDirectory () {
  const name = Math.floor(Math.random() * 0x7fffffff).toString(16);
  const directory = path.join(TMP_PATH, name);
  await fs.mkdirp(directory);
  return directory;
};
