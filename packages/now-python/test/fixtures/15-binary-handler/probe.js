module.exports = async function({ deploymentUrl, fetch, randomness }) {
  const fs = require('fs');
  const nowjson = require('./now.json');
  const probe = nowjson.probes[0];
  const probeUrl = `https://${deploymentUrl}${probe.path}`;
  const resp = await fetch(probeUrl);

  const bytes = await resp.arrayBuffer();

  const image = fs.readFileSync('./zeit-white-triangle.png');

  if (!image.equals(new Uint8Array(bytes))) {
    throw new Error(`unexpected response: ${bytes}`);
  }
};
