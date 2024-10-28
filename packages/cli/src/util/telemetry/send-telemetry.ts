/**
 * This file is bundled separately from the CLI so that it can
 * be invoked as a subprocess. This is done to avoid the overhead
 * of making a fetch request while the process is otherwise
 * ready to exit.
 */
import fetch from 'node-fetch';

const payloadString = process.argv.slice(2);

const payload = JSON.parse(payloadString[0]);

const run = () => {
  fetch(payload.url, {
    method: 'POST',
    headers: payload.headers,
    body: payload.body,
  });
};

run();
