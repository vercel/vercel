/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const setCookieParser = require('set-cookie-parser');
const { check, deployAndTest } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

async function checkForChange(url, initialValue, fetchOpts) {
  if (isNaN(initialValue)) {
    throw new Error(
      `expected number for initialValue, received ${initialValue}`
    );
  }

  return check(async () => {
    const res = await fetch(url, fetchOpts);
    const $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());

    if (isNaN(props.random)) {
      throw new Error(`Invalid random value ${props.random}`);
    }
    const newValue = props.random;
    return initialValue !== newValue ? 'success' : 'fail';
  }, 'success');
}

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should revalidate content properly from /blog', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog.json`
    );
    expect(dataRes.status).toBe(200);

    const data = await dataRes.json();
    expect(data.pageProps.blogIndex).toBe(true);

    const res = await fetch(`${ctx.deploymentUrl}/blog`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;

    expect(props.blogIndex).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({});
    expect($('#pathname').text()).toBe('/blog');
    expect($('#asPath').text()).toBe('/blog');

    await checkForChange(`${ctx.deploymentUrl}/blog`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/blog`);
    expect(res2.status).toBe(200);
    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());

    expect(props2.blogIndex).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({});
    expect($('#pathname').text()).toBe('/blog');
    expect($('#asPath').text()).toBe('/blog');
  });

  it('should load content properly from /blog/first', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/first.json`
    );
    expect(dataRes.status).toBe(200);

    const data = await dataRes.json();
    expect(data.pageProps.blogSlug).toBe(true);
    expect(data.pageProps.params).toEqual({ slug: 'first' });

    const res = await fetch(`${ctx.deploymentUrl}/blog/first`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;

    expect(props.blogSlug).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ slug: 'first' });
    expect($('#pathname').text()).toBe('/blog/[slug]');
    expect($('#asPath').text()).toBe('/blog/first');

    await checkForChange(`${ctx.deploymentUrl}/blog/first`, initialRandom);

    const res2 = await fetch(`${ctx.deploymentUrl}/blog/first`);
    expect(res2.status).toBe(200);
    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());

    expect(props2.blogSlug).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ slug: 'first' });
    expect($('#pathname').text()).toBe('/blog/[slug]');
    expect($('#asPath').text()).toBe('/blog/first');
  });

  it('should rewrite/404 for fallback: false page without preview mode', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/another.json`
    );
    expect(dataRes.status).toBe(404);
    expect(await dataRes.text()).toContain('This page could not be found');

    const res = await fetch(`${ctx.deploymentUrl}/blog/another`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('blog fallback rewrite');
  });

  let previewCookie;

  it('should enable preview mode successfully', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/api/enable`);
    expect(res.status).toBe(200);

    const cookies = setCookieParser.parse(
      setCookieParser.splitCookiesString(res.headers.get('set-cookie'))
    );
    const bypassCookie = cookies.find(
      cookie => cookie.name === '__prerender_bypass'
    );
    const previewDataCookie = cookies.find(
      cookie => cookie.name === '__next_preview_data'
    );

    expect(bypassCookie).toBeDefined();
    expect(previewDataCookie).toBeDefined();
    expect(bypassCookie.value.length > 0).toBe(true);
    expect(previewDataCookie.value.length > 0).toBe(true);

    previewCookie = cookies.reduce((prev, cur) => {
      return `${prev}${prev ? ';' : ''}${cur.name}=${cur.value}`;
    }, '');
  });

  it('should load fallback: false page with preview mode', async () => {
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/another.json`,
      {
        headers: {
          Cookie: previewCookie,
        },
      }
    );
    expect(dataRes.status).toBe(200);

    const data = await dataRes.json();
    expect(data.pageProps.blogSlug).toBe(true);
    expect(data.pageProps.params).toEqual({ slug: 'another' });

    const res = await fetch(`${ctx.deploymentUrl}/blog/another`, {
      headers: {
        Cookie: previewCookie,
      },
    });
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;

    expect(props.blogSlug).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ slug: 'another' });
    expect($('#pathname').text()).toBe('/blog/[slug]');
    expect($('#asPath').text()).toBe('/blog/another');

    await checkForChange(`${ctx.deploymentUrl}/blog/another`, initialRandom, {
      headers: {
        Cookie: previewCookie,
      },
    });

    const res2 = await fetch(`${ctx.deploymentUrl}/blog/another`, {
      headers: {
        Cookie: previewCookie,
      },
    });
    expect(res2.status).toBe(200);
    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());

    expect(props2.blogSlug).toBe(true);
    expect(JSON.parse($('#query').text())).toEqual({ slug: 'another' });
    expect($('#pathname').text()).toBe('/blog/[slug]');
    expect($('#asPath').text()).toBe('/blog/another');
  });
});
