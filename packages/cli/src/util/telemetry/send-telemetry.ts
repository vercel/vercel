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
