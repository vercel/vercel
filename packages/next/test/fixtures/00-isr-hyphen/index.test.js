/* eslint-env jest */
const path = require('path');
const { deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');
const cheerio = require('cheerio');

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  beforeAll(async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('app dir: should correctly handled ISRed pages with hyphenated segments', async () => {
    const res = await fetch(
      `${ctx.deploymentUrl}/app-dir-app/hyphenated-segment`
    );
    expect(res.status).toEqual(200);

    const $ = cheerio.load(await res.text());
    expect($('#content').text()).toEqual('Segment Value: hyphenated-segment');
  });

  it('pages dir: should correctly handled ISRed pages with hyphenated segments', async () => {
    const res = await fetch(
      `${ctx.deploymentUrl}/pages-dir-app/hyphenated-segment`
    );

    expect(res.status).toEqual(200);

    const $ = cheerio.load(await res.text());
    expect($('#content').text()).toEqual('Segment Value: hyphenated-segment');
  });
});
