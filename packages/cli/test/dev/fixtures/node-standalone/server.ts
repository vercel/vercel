import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const instanceId = randomUUID();
const marker = 'initial';
let requestCount = 0;

const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      url: req.url,
      pid: process.pid,
      instanceId,
      requestCount: ++requestCount,
      marker,
    })
  );
});

server.listen(process.env.PORT ?? 3000);
