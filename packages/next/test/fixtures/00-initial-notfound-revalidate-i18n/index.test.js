/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const { deployAndTest } = require('../../utils');
const setCookieParser = require('set-cookie-parser');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  const ctx = {};

  beforeAll(async () => {
    const res = await deployAndTest(__dirname);
    Object.assign(ctx, res);
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

  it('should render the page on-demand with preview mode enabled', async () => {
    for (const locale of ['fr', 'en-US', 'fr-FR', 'nl', 'nl-NL', 'de']) {
      const dataRes = await fetch(
        `${ctx.deploymentUrl}/_next/data/testing-build-id/${locale}/preview-only-not-found.json`
      );
      expect(await dataRes.text()).toContain('This page could not be found');

      const res = await fetch(
        `${ctx.deploymentUrl}/${locale}/preview-only-not-found`
      );
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('This page could not be found');

      const previewRes = await fetch(
        `${ctx.deploymentUrl}/${locale}/preview-only-not-found`,
        {
          headers: {
            Cookie: previewCookie,
          },
        }
      );
      expect(previewRes.status).toBe(200);

      const previewHtml = await previewRes.text();
      const preview$ = cheerio.load(previewHtml);
      const previewProps = JSON.parse(preview$('#props').text());

      expect(isNaN(previewProps.random)).toBe(false);
      expect(previewProps.preview).toBe(true);
      expect(previewHtml).toContain('preview notFound page');

      const dataPreviewRes = await fetch(
        `${ctx.deploymentUrl}/_next/data/testing-build-id/${locale}/preview-only-not-found.json`,
        {
          headers: {
            Cookie: previewCookie,
          },
        }
      );
      expect(dataPreviewRes.status).toBe(200);

      const dataPreviewResProps = await dataPreviewRes.json();
      expect(dataPreviewResProps.pageProps.preview).toBe(true);
      expect(isNaN(dataPreviewResProps.pageProps.random)).toBe(false);
    }
  });
});
