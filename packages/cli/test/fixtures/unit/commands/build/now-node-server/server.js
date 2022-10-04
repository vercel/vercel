const { createServer } = require('http');
const handler = (_req, res) => res.end('hi');
const server = createServer(handler);
module.exports = server;
