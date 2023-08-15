const path = require('path');
const cheerio = require('cheerio').default;
const { deployAndTest, check } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');
const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should revalidate content correctly', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/another`);
    expect(res.status).toBe(200);

    const html = await res.text();
    const $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const previousNow = props.now;

    expect(isNaN(props.now)).toBe(false);
    expect(props.content[0].trim()).toBe('hello great big wide world!');
    expect($('#page').text()).toBe('/another');

    await check(async () => {
      const res = await fetch(`${ctx.deploymentUrl}/another`);
      expect(res.status).toBe(200);

      const html = await res.text();
      const $ = cheerio.load(html);
      const props = JSON.parse($('#props').text());

      if (isNaN(props.now)) {
        throw new Error('invalid props: ' + html);
      }
      return props.now !== previousNow &&
        props.content[0].trim() === 'hello great big wide world!'
        ? 'success'
        : html;
    }, 'success');
  });

  it('should revalidate content correctly', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/post`);
    expect(res.status).toBe(200);

    const html = await res.text();
    const $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const previousNow = props.now;
    expect(props.content[0].trim()).toBe('hello great big wide world!');
    expect(isNaN(props.now)).toBe(false);
    expect($('#page').text()).toBe('/post');

    await check(async () => {
      const res = await fetch(`${ctx.deploymentUrl}/post`);
      expect(res.status).toBe(200);

      const html = await res.text();
      const $ = cheerio.load(html);
      const props = JSON.parse($('#props').text());
      expect($('#page').text()).toBe('/post');

      if (isNaN(props.now)) {
        throw new Error('invalid props: ' + html);
      }
      return props.now !== previousNow &&
        props.content[0].trim() === 'hello great big wide world!'
        ? 'success'
        : html;
    }, 'success');
  });
});
