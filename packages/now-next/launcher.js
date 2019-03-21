process.env.NODE_ENV = 'production';

const { Server } = require('http');
const { Bridge } = require('./now__bridge');
const page = require('./page');

const server = new Server(page.render);
const bridge = new Bridge(server);
bridge.listen();

exports.launcher = bridge.launcher;
