import resolveFrom from 'resolve-from';
import { parse } from 'url';
import getPort from 'get-port';
import { createServer } from 'http';

async function main(cwd: string) {
  const next = require(resolveFrom(cwd, 'next'));
  const app = next({ dev: true, dir: cwd });
  const handler = app.getRequestHandler();

  const openPort = await getPort({
    port: [5000, 4000],
  });

  const url = `http://localhost:${openPort}`;

  // Prepare for incoming requests
  await app.prepare();

  createServer((req, res) => {
    const parsedUrl = parse(req.url || '', true);
    handler(req, res, parsedUrl);
  }).listen(openPort, () => {
    if (process.send) {
      process.send(url);
    }
  });
}

main(process.cwd());
