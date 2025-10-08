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

    if (typeof newValue !== typeof initialValue) {
      throw new Error(
        `got mixed types in checkForChange ${url}, newValue ${newValue}, initialValue ${initialValue}`
      );
    }

    return initialValue !== newValue ? 'success' : 'fail';
  }, 'success');
}

const getProps = async path => {
  const html = await fetch(`${ctx.deploymentUrl}${path}`).then(res =>
    res.text()
  );

  const $ = cheerio.load(html);
  return JSON.parse($('#props').text());
};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should render / correctly', async () => {
    const props = await getProps('/');
    expect(props.params).toEqual({});

    await checkForChange(`${ctx.deploymentUrl}/`, props.random, async res => {
      const $ = cheerio.load(await res.text());
      return JSON.parse($('#props').text()).random;
    });

    const newProps = await getProps('/');
    expect(newProps.params).toEqual({});
  });

  it('should render /a correctly', async () => {
    const props = await getProps('/a');
    expect(props.params).toEqual({ slug: ['a'] });

    await checkForChange(`${ctx.deploymentUrl}/a`, props.random, async res => {
      const $ = cheerio.load(await res.text());
      return JSON.parse($('#props').text()).random;
    });

    const newProps = await getProps('/a');
    expect(newProps.params).toEqual({ slug: ['a'] });
  });

  it('should render /hello/world correctly', async () => {
    const props = await getProps('/hello/world');
    expect(props.params).toEqual({ slug: ['hello', 'world'] });

    await checkForChange(
      `${ctx.deploymentUrl}/hello/world`,
      props.random,
      async res => {
        const $ = cheerio.load(await res.text());
        return JSON.parse($('#props').text()).random;
      }
    );

    const newProps = await getProps('/hello/world');
    expect(newProps.params).toEqual({ slug: ['hello', 'world'] });
  });
});
