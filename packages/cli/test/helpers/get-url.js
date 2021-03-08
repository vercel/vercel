// Packages
const http = require('http');
const micro = require('micro');
const listen = require('test-listen');

module.exports = fn => {
  const srv = http.createServer(micro(fn));
  return listen(srv);
};
