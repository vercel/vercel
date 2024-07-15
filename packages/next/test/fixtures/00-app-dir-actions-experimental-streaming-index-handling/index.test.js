/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};

function findActionId(page, runtime) {
  page = `app${page}/page`; // add /app prefix and /page suffix

  for (const [actionId, details] of Object.entries(
    ctx.actionManifest[runtime]
  )) {
    if (details.workers[page]) {
      return actionId;
    }
  }

  throw new Error("Couldn't find action ID");
}

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);

    const actionManifest = await fetch(
      `${info.deploymentUrl}/server-reference-manifest.json`
    ).then(res => res.json());

    ctx.actionManifest = actionManifest;

    Object.assign(ctx, info);
  });

  it('should work when there is a rewrite targeting the root page', async () => {
    const actionId = findActionId('/static', 'node');

    const res = await fetch(ctx.deploymentUrl, {
      method: 'POST',
      body: JSON.stringify([1337]),
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': actionId,
      },
    });

    expect(res.status).toEqual(200);
    expect(res.headers.get('x-matched-path')).toBe('/static');
    expect(res.headers.get('x-vercel-cache')).toBe('BYPASS');

    const body = await res.text();
    // The action incremented the provided count by 1
    expect(body).toContain('1338');
  });
});
