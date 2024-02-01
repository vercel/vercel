const { readFile } = require('fs/promises');
const { join } = require('path');

module.exports = async function ({ deploymentUrl, fetch }) {
  const resp = await fetch(`https://${deploymentUrl}/api`);

  const bytes = await resp.arrayBuffer();

  const image = await readFile(join(__dirname, 'triangle.png'));

  if (!image.equals(new Uint8Array(bytes))) {
    throw new Error(`unexpected response comparing bytes for triangle.png: ${bytes}`);
  }
};
