const assert = require('assert');
const http = require('http');

const server = http.createServer((req, resp) => {
  assert(!process.env.RANDOMNESS_BUILD_ENV_VAR);
  assert(process.env.RANDOMNESS_ENV_VAR);
  resp.end(`${process.env.RANDOMNESS_ENV_VAR}:env`);
});

server.listen();
