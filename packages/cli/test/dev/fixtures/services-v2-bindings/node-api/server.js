// Internal node service. Only reachable through a service binding.
const http = require('http');

const port = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.end('node_api: ok');
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`node_api listening on ${port}`);
  });
