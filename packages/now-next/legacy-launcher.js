const { Server } = require('http');
const next = require('next-server');
const url = require('url');
const { Bridge } = require('./now__bridge');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = process.env.NOW_REGION === 'dev1' ? 'development' : 'production';
}

const app = next({});

const server = new Server((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  app.render(req, res, 'PATHNAME_PLACEHOLDER', parsedUrl.query, parsedUrl);
});

const bridge = new Bridge(server);
bridge.listen();

exports.launcher = bridge.launcher;
