const Hapi = require('@hapi/hapi');

const server = Hapi.server({
  port: 3000,
  host: 'localhost',
});

server.route({
  method: 'GET',
  path: '/{p*}',
  handler: () => 'hello from hapi:RANDOMNESS_PLACEHOLDER',
});

// server.listener is a node's http.Server
// server does not have the `listen` method so we need to export this instead

module.exports = server.listener;
