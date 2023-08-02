const { createGzip } = require('zlib');
// const { createServer } = require('http');

module.exports = (_req, resp) => {
  resp.setHeader('content-encoding', 'gzip');

  const gzip = createGzip();
  gzip.pipe(resp);
  gzip.end('Hello World!');
};
