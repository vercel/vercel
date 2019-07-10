const http = require('http');

const server = http.createServer((req, resp) => {
  resp.end('RANDOMNESS_PLACEHOLDER');
});

server.listen();
