const { Bridge } = require('./bridge.js');
const { Server } = require('http');
const bridge = new Bridge();

const saveListen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.on('listening', function () {
    bridge.port = this.address().port;
  });
  saveListen.apply(this, args);
};

try {
  process.env.NODE_ENV = 'production';
  // PLACEHOLDER
} catch (error) {
  console.error(error);
  bridge.userError = error;
}

exports.launcher = bridge.launcher;
