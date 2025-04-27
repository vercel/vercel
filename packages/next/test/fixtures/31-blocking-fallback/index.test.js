/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const { check, deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};

async function checkForChange(url, initialValue, getNewValue) {
  return check(async () => {
    const res = await fetch(url);

    if (res.status !== 200) {
      throw new Error(`Invalid status code ${res.status}`);
    }
    const newValue = await getNewValue(res);

    return initialValue !== newValue ? 'success' : 'fail';
  }, 'success');
}

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should revalidate content properly from dynamic pathname', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/regenerated/blue`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const initialTime = $('#time').text();
    expect($('#slug').text()).toBe('blue');

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/regenerated/blue`,
      initialTime,
      async res => {
        const $ = cheerio.load(await res.text());
        return $('#time').text();
      }
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/regenerated/blue`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#slug').text()).toBe('blue');
  });

  it('should revalidate content properly from /_next/data dynamic pathname', async () => {
    const res = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/regenerated/blue.json`
    );
    expect(res.status).toBe(200);

    const { pageProps: data } = await res.json();
    const initialTime = data.time;
    expect(data.slug).toBe('blue');
    expect(isNaN(initialTime)).toBe(false);

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/regenerated/blue.json`,
      initialTime,
      async res => {
        const { pageProps: data } = await res.json();
        return data.time;
      }
    );

    const res2 = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/regenerated/blue.json`
    );
    expect(res2.status).toBe(200);

    const { pageProps: data2 } = await res2.json();
    expect(data2.slug).toBe('blue');
  });
});
