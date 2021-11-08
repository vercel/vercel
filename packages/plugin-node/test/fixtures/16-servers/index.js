const http = require('http');

const server = http.createServer((req, res) => {
  res.end('hello:RANDOMNESS_PLACEHOLDER');
});

module.exports = server;
