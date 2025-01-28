const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);

    Object.assign(ctx, info);
  });

  it('should not clobber a user-provided redirect with a default locale rewrite', async () => {
    const res = await fetch(ctx.deploymentUrl, {
      redirect: 'manual',
      headers: {
        'x-redirect-me': '1',
      },
    });
    expect(res.status).toEqual(307);
    expect(res.headers.get('location')).toEqual(`${ctx.deploymentUrl}/fr-BE`);
  });
});
