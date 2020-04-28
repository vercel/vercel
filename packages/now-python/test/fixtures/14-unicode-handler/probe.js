module.exports = async function({ deploymentUrl, fetch }) {
  const nowjson = require('./now.json');
  const probe = nowjson.probes[0];
  const probeUrl = `https://${deploymentUrl}${probe.path}`;
  const resp = await fetch(probeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(probe.body),
  });

  const text = await resp.text();
  const respBody = JSON.parse(text);

  if (respBody.greeting !== 'hello, Χριστοφορε') {
    throw new Error(`unexpected response: ${respBody}`);
  }
};
