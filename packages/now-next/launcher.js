const { Server } = require('http');
const next = require('next-server');
const url = require('url');
const { Bridge } = require('./now__bridge.js');

const bridge = new Bridge();
bridge.port = 3000;

process.env.NODE_ENV = 'production';

const app = next({});

const server = new Server((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  app.render(req, res, 'PATHNAME_PLACEHOLDER', parsedUrl.query, parsedUrl);
});
server.listen(bridge.port);

exports.launcher = bridge.launcher;
