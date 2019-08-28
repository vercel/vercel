const assert = require("assert");

module.exports = async ({ deploymentUrl, fetch }) => {
  const resp1 = await fetch(`https://${deploymentUrl}/permanent`, {
    redirect: "manual"
  });
  assert.equal(resp1.status, 301);
  assert.equal(resp1.headers.get("location"), "/");

  const resp2 = await fetch(`https://${deploymentUrl}/not-permanent`, {
    redirect: "manual"
  });
  assert.equal(resp2.status, 302);
  assert.equal(resp2.headers.get("location"), "/");

  const resp3 = await fetch(`https://${deploymentUrl}/custom-status`, {
    redirect: "manual"
  });
  assert.equal(resp3.status, 404);
  assert.equal(resp3.headers.get("location"), "/");
};
