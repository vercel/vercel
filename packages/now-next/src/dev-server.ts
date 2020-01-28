import resolveFrom from 'resolve-from';
import { parse } from 'url';
import getPort from 'get-port';
import { createServer } from 'http';
import { syncEnvVars } from './utils';

process.on('unhandledRejection', err => {
  console.error('Exiting builder due to build error:');
  console.error(err);
  process.exit(1);
});

process.once('message', async ({ dir, runtimeEnv }) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const next = require(resolveFrom(dir, 'next'));
  const app = next({ dev: true, dir });
  const handler = app.getRequestHandler();

  const [openPort] = await Promise.all([getPort(), app.prepare()]);
  const url = `http://localhost:${openPort}`;

  syncEnvVars(process.env, process.env, runtimeEnv);

  createServer((req, res) => {
    const parsedUrl = parse(req.url || '', true);
    handler(req, res, parsedUrl);
  }).listen(openPort, () => {
    if (process.send) {
      process.send(url);
    }
  });
});
