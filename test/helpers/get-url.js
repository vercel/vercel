// Packages
const listen = require('test-listen');
const micro = require('micro');

module.exports = fn => {
  const srv = micro(fn);
  return listen(srv);
};
