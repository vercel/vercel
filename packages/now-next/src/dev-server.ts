import resolveFrom from 'resolve-from';
import { parse } from 'url';
import getPort from 'get-port';
import { createServer } from 'http';

export interface ProcessEnv {
  [key: string]: string;
}

async function main(env: ProcessEnv) {
  const { ENTRY_PATH } = env;

  if (!ENTRY_PATH) {
    console.error('No ENTRY_PATH defined');
    process.exit(1);

    return;
  }

  const next = require(resolveFrom(ENTRY_PATH, 'next'));
  const app = next({ dev: true, dir: ENTRY_PATH });
  const handler = app.getRequestHandler();

  const openPort = await getPort({
    port: [ 5000, 4000 ]
  });

  const url = `http://localhost:${openPort}`;

  // Prepare for incoming requests
  await app.prepare();

  createServer((req, res) => {
    const parsedUrl = parse(req.url || '', true);
    handler(req, res, parsedUrl);
  }).listen(openPort, (error: NodeJS.ErrnoException) => {
    if (error) {
      console.error(error);
      process.exit(1);

      return;
    }

    if (process.send) {
      process.send(url);
    }
  });
}

main(process.env as ProcessEnv);
