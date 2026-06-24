import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const instanceId = randomUUID();
const marker = 'initial';
let requestCount = 0;
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore',
});

const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      url: req.url,
      childPid: child.pid,
      pid: process.pid,
      instanceId,
      requestCount: ++requestCount,
      marker,
    })
  );
});

server.listen(process.env.PORT ?? 3000);
