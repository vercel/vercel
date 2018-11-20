const cowsay = require('cowsay/build/cowsay.umd.js').say;
const http = require('http');

// test that process.env is not replaced by webpack
process.env.NODE_ENV = 'development';

const server = http.createServer((req, resp) => {
  resp.end(cowsay({ text: 'cow:RANDOMNESS_PLACEHOLDER' }));
});

server.listen();
