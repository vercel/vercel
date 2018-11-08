const { Bridge } = require('./bridge.js');
const { Server } = require('http');
const bridge = new Bridge();
bridge.port = 3000;
let listener;

try {
  process.env.NODE_ENV = 'production';
  // PLACEHOLDER
} catch (error) {
  console.error(error);
  bridge.userError = error;
}

const server = new Server(listener);
server.listen(bridge.port);

exports.launcher = bridge.launcher;
