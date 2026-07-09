const { createServer } = require('node:http');

createServer((_req, res) => {
  res.statusCode = 200;
  res.end('ok');
}).listen(3000);
