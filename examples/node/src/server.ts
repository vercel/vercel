const { createServer } = require('node:http');

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (req.method === 'GET' && pathname === '/') {
    res.statusCode = 200;
    res.end('Hello World');
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    res.statusCode = 200;
    res.end('ok');
    return;
  }

  const userRouteMatch =
    req.method === 'GET' ? pathname.match(/^\/user\/([^/]+)$/) : null;

  if (userRouteMatch) {
    res.statusCode = 200;
    res.end(`User ID: ${decodeURIComponent(userRouteMatch[1])}`);
    return;
  }

  res.statusCode = 404;
  res.end(`Custom 404: ${pathname}`);
});

server.listen(Number(process.env.PORT || 3000));
