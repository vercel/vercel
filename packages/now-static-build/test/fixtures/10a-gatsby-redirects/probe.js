const assert = require("assert");

module.exports = async ({ deploymentUrl, fetch }) => {
  // check status codes
  const resp1 = await fetch(`https://${deploymentUrl}/permanent`, {
    redirect: "manual"
  });
  assert.equal(resp1.status, 301);

  const resp2 = await fetch(`https://${deploymentUrl}/not-permanent`, {
    redirect: "manual"
  });
  assert.equal(resp2.status, 302);

  const resp3 = await fetch(`https://${deploymentUrl}/custom-status`, {
    redirect: "manual"
  });
  assert.equal(resp3.status, 404);

  // check redirects
  const resp4 = await fetch(`https://${deploymentUrl}/redirect`);
  assert.ok((await resp4.text()).includes("home"), "should include `home`");

  const resp5 = await fetch(`https://${deploymentUrl}/page1`);
  assert.ok((await resp5.text()).includes("about"), "should include `about`");

  const resp6 = await fetch(`https://${deploymentUrl}/page2`);
  assert.ok((await resp6.text()).includes("page2"), "should include `page2`");

  const resp7 = await fetch(
    `https://${deploymentUrl}/__now_routes_g4t5bY.json`
  );
  assert.equal(resp7.status, 404);
};
