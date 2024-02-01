/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const { deployAndTest } = require('../../utils');
const setCookieParser = require('set-cookie-parser');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

const ctx = {};
let previewCookie;

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

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

  it('should disable preview mode successfully', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/api/disable`);
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
    expect(bypassCookie.value.length === 0).toBe(true);
    expect(previewDataCookie.value.length === 0).toBe(true);
  });

  it('should render the page on-demand with preview mode enabled (normal page)', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/docs`);
    expect(res.status).toBe(200);

    const html = await res.text();
    const $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const random = props.random;

    expect(props.hello).toBe('world');

    const previewRes = await fetch(`${ctx.deploymentUrl}/docs`, {
      headers: {
        Cookie: previewCookie,
      },
    });
    expect(previewRes.status).toBe(200);

    const previewHtml = await previewRes.text();
    const preview$ = cheerio.load(previewHtml);
    const previewProps = JSON.parse(preview$('#props').text());

    expect(previewProps.random).not.toBe(random);
    expect(isNaN(previewProps.random)).toBe(false);
    expect(previewProps.hello).toBe('world');
  });

  it('should render the page on-demand with preview mode enabled (dynamic page)', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/docs/first`);
    expect(res.status).toBe(200);

    const html = await res.text();
    const $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const random = props.random;

    expect(props.hello).toBe('world');
    expect(props.params).toEqual({ rest: ['first'] });

    const previewRes = await fetch(`${ctx.deploymentUrl}/docs/first`, {
      headers: {
        Cookie: previewCookie,
      },
    });
    expect(previewRes.status).toBe(200);

    const previewHtml = await previewRes.text();
    const preview$ = cheerio.load(previewHtml);
    const previewProps = JSON.parse(preview$('#props').text());

    expect(previewProps.random).not.toBe(random);
    expect(isNaN(previewProps.random)).toBe(false);
    expect(previewProps.hello).toBe('world');
    expect(previewProps.params).toEqual({ rest: ['first'] });
  });
});
