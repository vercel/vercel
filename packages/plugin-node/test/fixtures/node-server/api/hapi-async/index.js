const Hapi = require('@hapi/hapi');

const init = async () => {
  const server = Hapi.server({
    port: 3000,
    host: 'localhost',
  });

  server.route({
    method: 'GET',
    path: '/{p*}',
    handler: () => 'hapi-async',
  });

  await server.start();
  console.log('Hapi server running on %s', server.info.uri);
};

process.on('unhandledRejection', err => {
  console.log('Hapi failed in an unexpected way');
  console.log(err);
  process.exit(1);
});

init();
