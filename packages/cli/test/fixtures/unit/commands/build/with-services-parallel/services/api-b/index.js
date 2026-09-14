const { createServer } = require('node:http');
const { greet } = require('js-shared');

createServer((_req, res) => {
  res.statusCode = 200;
  res.end(greet('api-b'));
}).listen(3000);
