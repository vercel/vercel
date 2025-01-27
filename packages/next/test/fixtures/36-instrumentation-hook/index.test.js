const path = require('path');
const { deployAndTest } = require('../../utils');
const { describe } = require('node:test');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  // this test needs to run first to set ctx.deploymentUrl
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('node: should be able to use the instrumentation code in a app router page', async () => {
    const endpoint = `${ctx.deploymentUrl}/node`;
    console.log(endpoint);
    const res = await fetch(endpoint);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain(`(node) isOdd: false`);
  });

  it('node: should be able to use the instrumentation code in a route handler', async () => {
    const endpoint = `${ctx.deploymentUrl}/api/node`;
    console.log(endpoint);
    const res = await fetch(endpoint);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      runtime: 'node',
      payload: 'isOdd: false',
    });
  });

  it('edge: should be able to use the instrumentation code in a app router page', async () => {
    const endpoint = `${ctx.deploymentUrl}/edge`;
    console.log(endpoint);
    const res = await fetch(endpoint);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain(`(edge) isOdd: false`);
  });

  it('edge: should be able to use the instrumentation code in a route handler', async () => {
    const endpoint = `${ctx.deploymentUrl}/api/edge`;
    console.log(endpoint);
    const res = await fetch(endpoint);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      runtime: 'edge',
      payload: 'isOdd: false',
    });
  });
});
