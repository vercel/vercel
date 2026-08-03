const assert = require('assert');

module.exports = async ({ deploymentUrl, fetch }) => {
  const baseUrl = `https://${deploymentUrl}`;

  const warmResponse = await fetch(`${baseUrl}/warm`);
  assert.equal(await warmResponse.text(), 'warm');

  const startedAt = Date.now();
  const scheduleResponse = await fetch(baseUrl);
  assert.equal(await scheduleResponse.text(), 'scheduled');
  assert.ok(
    Date.now() - startedAt < 3000,
    'WaitUntil delayed the function response'
  );

  for (let attempt = 0; attempt < 60; attempt++) {
    const statusResponse = await fetch(`${baseUrl}/status`);
    if ((await statusResponse.text()) === 'complete') {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error('WaitUntil task did not complete');
};
