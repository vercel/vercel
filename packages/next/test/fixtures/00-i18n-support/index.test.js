/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const { check, deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

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

    if (!ABSOLUTE_URL_PATTERN.test(ctx.deploymentUrl)) {
      const details = JSON.stringify(ctx);
      throw new Error(
        `Deployment did not result in an absolute deploymentUrl: ${details}`
      );
    }
  });

  it('should revalidate content properly from /', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/en-US.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');
    expect(JSON.parse($('#router-query').text())).toEqual({});

    await checkForChange(`${ctx.deploymentUrl}/`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());

    expect($('#router-locale').text()).toBe('en-US');
    expect(JSON.parse($('#router-query').text())).toEqual({});
  });

  it('should revalidate content properly from /fr', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/fr.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/fr`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');
    expect(JSON.parse($('#router-query').text())).toEqual({});

    await checkForChange(`${ctx.deploymentUrl}/fr`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/fr`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('fr');
    expect(JSON.parse($('#router-query').text())).toEqual({});
  });

  it('should revalidate content properly from /nl-NL', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/nl-NL.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(JSON.parse($('#router-query').text())).toEqual({});

    await checkForChange(`${ctx.deploymentUrl}/nl-NL`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(JSON.parse($('#router-query').text())).toEqual({});
  });

  it('should revalidate content properly from /gsp/fallback/first', async () => {
    // check the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/en-US/gsp/fallback/first.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/gsp/fallback/first`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');
    expect(props.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });

    await checkForChange(
      `${ctx.deploymentUrl}/gsp/fallback/first`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/gsp/fallback/first`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect($('#router-locale').text()).toBe('en-US');
    expect(props2.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });
  });

  it('should revalidate content properly from /fr/gsp/fallback/first', async () => {
    // check the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/fr/gsp/fallback/first.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/fr/gsp/fallback/first`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');
    expect(props.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });

    await checkForChange(
      `${ctx.deploymentUrl}/fr/gsp/fallback/first`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/fr/gsp/fallback/first`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect($('#router-locale').text()).toBe('fr');
    expect(props2.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });
  });

  it('should revalidate content properly from /nl-NL/gsp/fallback/first', async () => {
    // check the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/nl-NL/gsp/fallback/first.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/nl-NL/gsp/fallback/first`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(props.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });

    await checkForChange(
      `${ctx.deploymentUrl}/nl-NL/gsp/fallback/first`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/nl-NL/gsp/fallback/first`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(props2.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });
  });

  it('should revalidate content properly from /gsp/fallback/new-page', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/en-US/gsp/fallback/new-page.json`
    );
    expect(dataRes.status).toBe(200);

    let props;
    let $;

    await check(async () => {
      const res = await fetch(`${ctx.deploymentUrl}/gsp/fallback/new-page`);
      expect(res.status).toBe(200);

      const html = await res.text();
      $ = cheerio.load(html);
      props = JSON.parse($('#props').text());
      return props.random ? 'success' : 'fail';
    }, 'success');

    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');
    expect(props.params).toEqual({ slug: 'new-page' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'new-page' });

    await checkForChange(
      `${ctx.deploymentUrl}/gsp/fallback/new-page`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/gsp/fallback/new-page`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr/gsp/fallback/new-page', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/fr/gsp/fallback/new-page.json`
    );
    expect(dataRes.status).toBe(200);

    let props;
    let $;

    await check(async () => {
      const res = await fetch(`${ctx.deploymentUrl}/fr/gsp/fallback/new-page`);
      expect(res.status).toBe(200);

      const html = await res.text();
      $ = cheerio.load(html);
      props = JSON.parse($('#props').text());
      return props.random ? 'success' : 'fail';
    }, 'success');

    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');
    expect(props.params).toEqual({ slug: 'new-page' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'new-page' });

    await checkForChange(
      `${ctx.deploymentUrl}/fr/gsp/fallback/new-page`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/fr/gsp/fallback/new-page`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL/gsp/fallback/new-page', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/nl-NL/gsp/fallback/new-page.json`
    );
    expect(dataRes.status).toBe(200);

    let props;
    let $;

    await check(async () => {
      const res = await fetch(
        `${ctx.deploymentUrl}/nl-NL/gsp/fallback/new-page`
      );
      expect(res.status).toBe(200);

      const html = await res.text();
      $ = cheerio.load(html);
      props = JSON.parse($('#props').text());
      return props.random ? 'success' : 'fail';
    }, 'success');

    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(props.params).toEqual({ slug: 'new-page' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'new-page' });

    await checkForChange(
      `${ctx.deploymentUrl}/nl-NL/gsp/fallback/new-page`,
      initialRandom
    );

    const res2 = await fetch(
      `${ctx.deploymentUrl}/nl-NL/gsp/fallback/new-page`
    );
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(props2.params).toEqual({ slug: 'new-page' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'new-page' });
  });

  it('should revalidate content properly from /gsp/no-fallback/first', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/en-US/gsp/no-fallback/first.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/gsp/no-fallback/first`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');
    expect(props.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });

    await checkForChange(
      `${ctx.deploymentUrl}/gsp/no-fallback/first`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/gsp/no-fallback/first`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect($('#router-locale').text()).toBe('en-US');
    expect(props2.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });
  });

  it('should revalidate content properly from /fr/gsp/no-fallback/first', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/fr/gsp/no-fallback/first.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/fr/gsp/no-fallback/first`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');
    expect(props.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });

    await checkForChange(
      `${ctx.deploymentUrl}/fr/gsp/no-fallback/first`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/fr/gsp/no-fallback/first`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect($('#router-locale').text()).toBe('fr');
    expect(props2.params).toEqual({ slug: 'first' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' });
  });

  it('should revalidate content properly from /nl-NL/gsp/no-fallback/second', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/nl-NL/gsp/no-fallback/second.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(
      `${ctx.deploymentUrl}/nl-NL/gsp/no-fallback/second`
    );
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(props.params).toEqual({ slug: 'second' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'second' });

    await checkForChange(
      `${ctx.deploymentUrl}/nl-NL/gsp/no-fallback/second`,
      initialRandom
    );

    const res2 = await fetch(
      `${ctx.deploymentUrl}/nl-NL/gsp/no-fallback/second`
    );
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect($('#router-locale').text()).toBe('nl-NL');
    expect(props2.params).toEqual({ slug: 'second' });
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'second' });
  });
});
