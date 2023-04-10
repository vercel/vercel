const { resolve } = require('path');
const rootDirectory = resolve(__dirname, '..', '..', '..');
function stripRootDirectory(filePath) {
  return filePath.replace(`${rootDirectory}/`, '');
}
module.exports = {
  rootDirectory,
  stripRootDirectory,
};
