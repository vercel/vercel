const { isAbsolute } = require('path');
const { createDeployment } = require('now-client');

async function deployWithNowClient(clientOpts, requestBody) {
  const { path } = clientOpts;
  if (!isAbsolute(path)) {
    throw new Error('Expected absolute path but found: ' + path);
  }
  const indications = [];
  let deploymentUrl;
  for await (const event of createDeployment(clientOpts, requestBody)) {
    if (['tip', 'notice', 'warning'].includes(event.type)) {
      console.log({ event });
    }

    if (event.type === 'created') {
      deploymentUrl = event.payload.url;
      console.log({ deploymentUrl });
    }

    if (event.type === 'ready') {
      // What do?
    }

    if (event.type === 'canceled' || event.type === 'alias-assigned') {
      event.indications = indications;
      event.deploymentUrl = deploymentUrl;
      return event;
    }

    if (event.type === 'error') {
      return event;
    }
  }
}

module.exports = { deployWithNowClient };
