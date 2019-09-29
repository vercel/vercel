const fetch = require('../../../../../test/lib/deployment/fetch-retry');

async function fetchDeploymentUrl(url, opts) {
  for (let i = 0; i < 50; i += 1) {
    const resp = await fetch(url, opts);
    const text = await resp.text();
    if (text && !text.includes('Join Free')) {
      return { resp, text };
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error(`Failed to wait for deployment READY. Url is ${url}`);
}

module.exports = async function({ deploymentUrl, fetch, randomness }) {
  const nowjson = require('./now.json');
  const probe = nowjson.probes[0];
  const probeUrl = `https://${deploymentUrl}${probe.path}`;
  const { resp, text } = await fetchDeploymentUrl(probeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(probe.body),
  });

  const respBody = JSON.parse(text);

  if (respBody.greeting !== 'hello, Χριστοφορε') {
    throw new Error(`unexpected response: ${respBody}`);
  }
};
