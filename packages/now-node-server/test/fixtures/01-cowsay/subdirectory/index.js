const yodasay = require('yodasay').say;
const http = require('http');

// test that process.env is not replaced by webpack
process.env.NODE_ENV = 'development';

const server = http.createServer((req, resp) => {
  resp.end(yodasay({ text: 'yoda:RANDOMNESS_PLACEHOLDER' }));
});

server.listen();
