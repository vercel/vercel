const assert = require("assert");

// we need this due to https://github.com/bitinn/node-fetch/issues/417
const getRawLocation = res => {
  const location = res.headers.get("location");
  const parsed = new URL(location);
  return parsed.pathname;
};

module.exports = async ({ deploymentUrl, fetch }) => {
  const resp1 = await fetch(`https://${deploymentUrl}/permanent`, {
    redirect: "manual"
  });
  assert.equal(resp1.status, 301);
  assert.equal(getRawLocation(resp1), "/");

  const resp2 = await fetch(`https://${deploymentUrl}/not-permanent`, {
    redirect: "manual"
  });
  assert.equal(resp2.status, 302);
  assert.equal(getRawLocation(resp2), "/");

  const resp3 = await fetch(`https://${deploymentUrl}/custom-status`, {
    redirect: "manual"
  });
  assert.equal(resp3.status, 404);
  assert.equal(getRawLocation(resp3), "/");
};
