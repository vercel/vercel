const { join } = require('path');
const { tmpdir } = require('os');
const { mkdirp } = require('fs-extra');

module.exports = async function getWritableDirectory() {
  const name = Math.floor(Math.random() * 0x7fffffff).toString(16);
  const directory = join(tmpdir(), name);
  await mkdirp(directory);
  return directory;
};
