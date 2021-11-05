const http = require('http');

const server = http.createServer((req, resp) => {
  resp.end('root:RANDOMNESS_PLACEHOLDER');
});

server.listen();
