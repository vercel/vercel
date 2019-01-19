const http = require('http');
const isBundled = require('./is-bundled.js');

const server = http.createServer((req, resp) => {
  resp.end(isBundled() ? 'RANDOMNESS_PLACEHOLDER:with-bundle' : 'WITHOUT-BUNDLE-THAT-IS-WRONG');
});

server.listen();
