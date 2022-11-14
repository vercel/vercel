/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const { check, deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

async function checkForChange(url, initialValue, hardError) {
  if (isNaN(initialValue)) {
    throw new Error(
      `expected number for initialValue, received ${initialValue}`
    );
  }

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

  it('should revalidate content properly from /docs', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/index.json`
    );
    expect(dataRes.status).toBe(200);

    const data = await dataRes.json();
    expect(data.pageProps.index).toBe(true);

    const res = await fetch(`${ctx.deploymentUrl}/docs`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;

    expect(props.index).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({});
    expect($('#pathname').text()).toBe('pathname /');
    expect($('#asPath').text()).toBe('asPath /');

    await checkForChange(`${ctx.deploymentUrl}/docs`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/docs`);
    expect(res2.status).toBe(200);
    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());

    expect(props2.index).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({});
    expect($('#pathname').text()).toBe('pathname /');
    expect($('#asPath').text()).toBe('asPath /');
  });

  it('should load content properly from /docs/hello', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/hello.json`
    );
    expect(dataRes.status).toBe(200);

    const data = await dataRes.json();
    expect(data.pageProps.id).toBe(true);
    expect(data.pageProps.params).toEqual({ id: 'hello' });

    const res = await fetch(`${ctx.deploymentUrl}/docs/hello`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;

    expect(props.id).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ id: 'hello' });
    expect($('#pathname').text()).toBe('pathname /[id]');
    expect($('#asPath').text()).toBe('asPath /hello');

    await checkForChange(`${ctx.deploymentUrl}/docs/hello`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/docs/hello`);
    expect(res2.status).toBe(200);
    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());

    expect(props2.id).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ id: 'hello' });
    expect($('#pathname').text()).toBe('pathname /[id]');
    expect($('#asPath').text()).toBe('asPath /hello');
  });

  it('should revalidate content properly from /docs/blog', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/blog.json`
    );
    expect(dataRes.status).toBe(200);

    const data = await dataRes.json();
    expect(data.pageProps.blogIndex).toBe(true);

    const res = await fetch(`${ctx.deploymentUrl}/docs/blog`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;

    expect(props.blogIndex).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({});
    expect($('#pathname').text()).toBe('pathname /blog');
    expect($('#asPath').text()).toBe('asPath /blog');

    await checkForChange(`${ctx.deploymentUrl}/docs/blog`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/docs/blog`);
    expect(res2.status).toBe(200);
    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());

    expect(props2.blogIndex).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({});
    expect($('#pathname').text()).toBe('pathname /blog');
    expect($('#asPath').text()).toBe('asPath /blog');
  });

  it('should revalidate content properly from /docs/blog/another', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/blog/another.json`
    );
    expect(dataRes.status).toBe(200);

    const data = await dataRes.json();
    expect(data.pageProps.blogSlug).toBe(true);
    expect(data.pageProps.params).toEqual({
      slug: 'another',
    });

    const res = await fetch(`${ctx.deploymentUrl}/docs/blog/another`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;

    expect(props.blogSlug).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ slug: 'another' });
    expect($('#pathname').text()).toBe('pathname /blog/[slug]');
    expect($('#asPath').text()).toBe('asPath /blog/another');

    await checkForChange(
      `${ctx.deploymentUrl}/docs/blog/another`,
      initialRandom
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/docs/blog/another`);
    expect(res2.status).toBe(200);
    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());

    expect(props2.blogSlug).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ slug: 'another' });
    expect($('#pathname').text()).toBe('pathname /blog/[slug]');
    expect($('#asPath').text()).toBe('asPath /blog/another');
  });
});
