import { createServer } from 'node:http';

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/') {
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
    });
    res.end('Hello from a standalone Node.js server on Vercel.');
    return;
  }

  res.writeHead(404, {
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(3000);
