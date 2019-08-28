const assert = require("assert");

module.exports = async ({ deploymentUrl, fetch }) => {
  const resp1 = await fetch(`https://${deploymentUrl}/permanent`, {
    redirect: "manual"
  });
  assert.equal(resp1.status, 301);
  // we need to put the full url
  // due to https://github.com/bitinn/node-fetch/issues/417
  assert.equal(resp1.headers.get("location"), `/`);

  const resp2 = await fetch(`https://${deploymentUrl}/not-permanent`, {
    redirect: "manual"
  });
  assert.equal(resp2.status, 302);
  assert.equal(resp2.headers.get("location"), `/about`);

  const resp3 = await fetch(`https://${deploymentUrl}/custom-status`, {
    redirect: "manual"
  });
  assert.equal(resp3.status, 404);
  assert.equal(resp3.headers.get("location"), `/blog`);

  const resp4 = await fetch(`https://${deploymentUrl}/page1`, {
    redirect: "manual"
  });
  assert.equal(resp4.status, 302);
  assert.equal(resp4.headers.get("location"), `/about`);

  const resp5 = await fetch(`https://${deploymentUrl}/page1`);
  assert.ok((await resp5.text()).includes("about"), "should include `about`");

  const resp6 = await fetch(`https://${deploymentUrl}/page2`);
  assert.ok((await resp6.text()).includes("page2"), "should include `page2`");
};
