const { createServer } = require('node:http');

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');

  if (url.pathname === '/') {
    sendJson(res, 200, { message: 'Hello from Node HTTP' });
    return;
  }

  if (url.pathname === '/ping') {
    sendJson(res, 200, { message: 'pong from Node HTTP' });
    return;
  }

  sendJson(res, 404, { detail: '404 from Node HTTP' });
});

module.exports = server;
