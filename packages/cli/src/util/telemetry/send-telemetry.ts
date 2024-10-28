import fetch from 'node-fetch';

const payloadString = process.argv.slice(2);

const payload = JSON.parse(payloadString[0]);

const run = () => {
  fetch(payload.url, {
    method: 'POST',
    headers: payload.headers,
    body: payload.body,
  })
    .then(response => response.json())
    .then(() => {
      process.stdout.write('success');
      process.exit(0);
    })
    .catch(() => {
      process.stderr.write('failure');
      process.exit(1);
    });
};

run();
