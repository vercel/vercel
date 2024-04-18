/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};

function findActionId(manifest, page) {
  for (const [actionId, details] of Object.entries(manifest.node)) {
    if (details.workers[page]) {
      return actionId; // Return the actionId (node key) if the page is found
    }
  }
  return null; // Return null if the page is not found
}

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should match the server action to the streaming prerender function (with next-action)', async () => {
    // grab the action ID for the index worker
    const data = await fetch(
      `${ctx.deploymentUrl}/server-reference-manifest.json`
    ).then(res => res.json());

    const actionId = findActionId(data, 'app/page');

    const res = await fetch(`${ctx.deploymentUrl}/`, {
      method: 'POST',
      body: JSON.stringify([1337]),
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': actionId,
      },
    });

    expect(res.status).toEqual(200);
    const body = await res.text();
    // the requested body was 1337, so the increment method should return 1338
    expect(body).toContain('1338');
    expect(res.headers.get('x-matched-path')).toBe('/index.action');
    expect(res.headers.get('x-vercel-cache')).toBe('MISS');
  });

  it('should match the server action to the streaming prerender function (with formdata body)', async () => {
    const data = await fetch(
      `${ctx.deploymentUrl}/server-reference-manifest.json`
    ).then(res => res.json());

    const actionId = findActionId(data, 'app/other/page');

    const res = await fetch(`${ctx.deploymentUrl}/other`, {
      method: 'POST',
      body: `------WebKitFormBoundary8xC9UKOVzHBaGYkR\r\nContent-Disposition: form-data; name=\"1_$ACTION_ID_${actionId}\"\r\n\r\n\r\n------WebKitFormBoundary8xC9UKOVzHBaGYkR\r\nContent-Disposition: form-data; name=\"0\"\r\n\r\n[\"$K1\"]\r\n------WebKitFormBoundary8xC9UKOVzHBaGYkR--\r\n`,
      headers: {
        'Content-Type':
          'multipart/form-data; boundary=----WebKitFormBoundary8xC9UKOVzHBaGYkR',
      },
    });

    expect(res.status).toEqual(200);
    expect(res.headers.get('x-matched-path')).toBe('/other.action');
    expect(res.headers.get('x-vercel-cache')).toBe('MISS');
  });

  it('should match the server action to the streaming prerender function (force-static dynamic segment)', async () => {
    const data = await fetch(
      `${ctx.deploymentUrl}/server-reference-manifest.json`
    ).then(res => res.json());

    const actionId = findActionId(data, 'app/dynamic-static/page');

    const res = await fetch(`${ctx.deploymentUrl}/dynamic-static`, {
      method: 'POST',
      body: `------WebKitFormBoundary8xC9UKOVzHBaGYkR\r\nContent-Disposition: form-data; name=\"1_$ACTION_ID_${actionId}\"\r\n\r\n\r\n------WebKitFormBoundary8xC9UKOVzHBaGYkR\r\nContent-Disposition: form-data; name=\"0\"\r\n\r\n[\"$K1\"]\r\n------WebKitFormBoundary8xC9UKOVzHBaGYkR--\r\n`,
      headers: {
        'Content-Type':
          'multipart/form-data; boundary=----WebKitFormBoundary8xC9UKOVzHBaGYkR',
      },
    });

    expect(res.status).toEqual(200);
    expect(res.headers.get('x-matched-path')).toBe('/[dynamic-static].action');
    expect(res.headers.get('x-vercel-cache')).toBe('MISS');
  });
});
