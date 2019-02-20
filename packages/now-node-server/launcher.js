const { Server } = require('http');
const { Bridge } = require('./bridge.js');

const bridge = new Bridge();

const saveListen = Server.prototype.listen;
Server.prototype.listen = function listen() {
  bridge.setServer(this);
  Server.prototype.listen = saveListen;
  return bridge.listen();
};

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// PLACEHOLDER

exports.launcher = bridge.launcher;
