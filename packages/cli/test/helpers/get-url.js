// Packages
const http = require('http');
const listen = require('test-listen');

module.exports = fn => {
  const srv = http.createServer(fn);
  return listen(srv);
};
