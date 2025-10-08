/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const { check, deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

async function checkForChange(url, initialValue, hardError) {
  return check(
    async () => {
      const res = await fetch(url);

      if (res.status !== 200) {
        throw new Error(`Invalid status code ${res.status}`);
      }
      const $ = cheerio.load(await res.text());
      const props = JSON.parse($('#props').text());

      if (isNaN(props.random)) {
        throw new Error(`Invalid random value ${props.random}`);
      }
      const newValue = props.random;
      return initialValue !== newValue ? 'success' : 'fail';
    },
    'success',
    hardError
  );
}

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should revalidate content properly from /', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');

    await checkForChange(`${ctx.deploymentUrl}/`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/fr`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');

    await checkForChange(`${ctx.deploymentUrl}/fr`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/fr`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');

    await checkForChange(`${ctx.deploymentUrl}/nl-NL`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('nl-NL');
  });

  it('should revalidate content properly from /second', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/second`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');

    await checkForChange(`${ctx.deploymentUrl}/second`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/second`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr/second', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/fr/second`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');

    await checkForChange(`${ctx.deploymentUrl}/fr/second`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/fr/second`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL/second', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/nl-NL/second`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');

    await checkForChange(`${ctx.deploymentUrl}/nl-NL/second`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/nl-NL/second`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('nl-NL');
  });
});
