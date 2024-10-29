/**
 * This file is bundled separately from the CLI so that it can
 * be invoked as a subprocess. This is done to avoid the overhead
 * of making a fetch request while the process is otherwise
 * ready to exit.
 */
import fetch from 'node-fetch';

const payloadString = process.argv.slice(2);

const { url, ...payload } = JSON.parse(payloadString[0]);

const run = async () => {
  const res = await fetch(url, payload);
  const status = res.status;
  const cliTracked = res.headers.get('x-vercel-cli-tracked') || '';
  process.stdout.write(JSON.stringify({ status, cliTracked }));
};

run();
