if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = process.env.NOW_REGION === 'dev1' ? 'development' : 'production';
}

const { Server } = require('http');
const { Bridge } = require('./now__bridge');
const page = require('./page');

const server = new Server(page.render);
const bridge = new Bridge(server);
bridge.listen();

exports.launcher = bridge.launcher;
