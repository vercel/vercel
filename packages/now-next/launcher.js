const { Bridge } = require('./now__bridge.js');
const { Server } = require('http');
const next = require('next-server')
const bridge = new Bridge();
bridge.port = 3000;

process.env.NODE_ENV = 'production';

const app = next({})
const handler = app.getRequestHandler()

const server = new Server(handler);
server.listen(bridge.port);

exports.launcher = bridge.launcher;
