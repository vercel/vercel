const { isAbsolute } = require('path');
const { createDeployment } = require('now-client');

async function deployWithNowClient({ token, path }) {
  if (!isAbsolute(path)) {
    throw new Error('Expected absolute path but found: ' + path);
  }
  const indications = [];
  let deploymentUrl;
  for await (const event of createDeployment({ token, path })) {
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
      const error = new Error(event.payload.message || 'Deployment failed');
      error.code = event.payload.code;
      error.status = event.payload.status;
      throw error;
    }
  }
}

module.exports = { deployWithNowClient };
