const path = require('path');
const cheerio = require('cheerio');
const { deployAndTest, check } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  let ctx = {};

  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should revalidate content correctly for middleware rewrite', async () => {
    const propsFromHtml = async () => {
      let res = await fetch(
        `${ctx.deploymentUrl}/docs/rewrite-to-another-site`
      );
      let $ = cheerio.load(await res.text());
      let props = JSON.parse($('#props').text());
      return props;
    };
    let props = await propsFromHtml();
    expect(isNaN(props.now)).toBe(false);

    const { pageProps: data } = await fetch(
      `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/rewrite-to-another-site.json`,
      { headers: { 'x-nextjs-data': '1' } }
    ).then(res => res.json());

    expect(isNaN(data.now)).toBe(false);

    await check(async () => {
      const revalidateRes = await fetch(
        `${ctx.deploymentUrl}/docs/api/revalidate?urlPath=/docs/_sites/test-revalidate`
      );
      expect(revalidateRes.status).toBe(200);
      expect(await revalidateRes.json()).toEqual({ revalidated: true });

      const newProps = await propsFromHtml();
      console.log({ props, newProps });

      if (isNaN(newProps.now)) {
        throw new Error();
      }
      return newProps.now !== props.now
        ? 'success'
        : JSON.stringify({
            newProps,
            props,
          });
    }, 'success');

    await check(async () => {
      const { pageProps: newData } = await fetch(
        `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/rewrite-to-another-site.json`,
        { headers: { 'x-nextjs-data': '1' } }
      ).then(res => res.json());

      console.log({ newData, data });

      if (isNaN(newData.now)) {
        throw new Error();
      }
      return newData.now !== data.now
        ? 'success'
        : JSON.stringify({
            newData,
            data,
          });
    }, 'success');
  });

  it('should revalidate content correctly for optional catch-all route', async () => {
    const propsFromHtml = async () => {
      let res = await fetch(`${ctx.deploymentUrl}/docs/financial`);
      let $ = cheerio.load(await res.text());
      let props = JSON.parse($('#props').text());
      return props;
    };
    let props = await propsFromHtml();
    expect(isNaN(props.now)).toBe(false);

    const { pageProps: data } = await fetch(
      `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/financial.json?slug=financial`,
      { headers: { 'x-nextjs-data': '1' } }
    ).then(res => res.json());

    expect(isNaN(data.now)).toBe(false);

    await check(async () => {
      const revalidateRes = await fetch(
        `${ctx.deploymentUrl}/docs/api/revalidate?urlPath=/docs/financial`
      );
      expect(revalidateRes.status).toBe(200);
      expect(await revalidateRes.json()).toEqual({ revalidated: true });

      const newProps = await propsFromHtml();
      console.log({ props, newProps });

      if (isNaN(newProps.now)) {
        throw new Error();
      }
      return newProps.now !== props.now
        ? 'success'
        : JSON.stringify({
            newProps,
            props,
          });
    }, 'success');

    await check(async () => {
      const { pageProps: newData } = await fetch(
        `${ctx.deploymentUrl}/docs/_next/data/testing-build-id/financial.json?slug=financial`,
        { headers: { 'x-nextjs-data': '1' } }
      ).then(res => res.json());

      console.log({ newData, data });

      if (isNaN(newData.now)) {
        throw new Error();
      }
      return newData.now !== data.now
        ? 'success'
        : JSON.stringify({
            newData,
            data,
          });
    }, 'success');
  });
});
