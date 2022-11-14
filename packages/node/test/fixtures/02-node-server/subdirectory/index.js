const http = require('http');

const server = http.createServer((req, resp) => {
  resp.end('subdir:RANDOMNESS_PLACEHOLDER');
});

server.listen();
