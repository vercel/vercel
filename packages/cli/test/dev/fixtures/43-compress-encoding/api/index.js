const { createGzip } = require('zlib');

module.exports = (_req, resp) => {
  resp.setHeader('content-encoding', 'gzip');

  const gzip = createGzip();
  gzip.pipe(resp);
  gzip.end('Hello World!');
};
