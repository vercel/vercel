const http = require('http');

const port = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.end(`web: ${req.url}`);
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`web listening on ${port}`);
  });
