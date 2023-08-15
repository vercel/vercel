/* eslint-env jest */
const path = require('path');
const cheerio = require('cheerio');
const { deployAndTest, check } = require('../../utils');
const fetch = require('../../../../../test/lib/deployment/fetch-retry');

async function checkForChange(url, initialValue, getNewValue) {
  return check(async () => {
    const res = await fetch(url);

    if (res.status !== 200) {
      throw new Error(`Invalid status code ${res.status}`);
    }
    const newValue = await getNewValue(res);

    return initialValue !== newValue
      ? 'success'
      : JSON.stringify({ initialValue, newValue });
  }, 'success');
}

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it.each([
    {
      title: 'should update content for prerendered path correctly',
      pathsToCheck: [
        { urlPath: '/fallback-blocking/first' },
        { urlPath: '/fallback-blocking/first', query: '?slug=first' },
        { urlPath: '/fallback-blocking/first', query: '?slug=random' },
        { urlPath: '/fallback-blocking/first', query: '?another=value' },
      ],
    },
    {
      title: 'should update content for non-prerendered path correctly',
      pathsToCheck: [
        { urlPath: '/fallback-blocking/on-demand-2' },
        {
          urlPath: '/fallback-blocking/on-demand-2',
          query: '?slug=on-demand-2',
        },
        { urlPath: '/fallback-blocking/on-demand-2', query: '?slug=random' },
        { urlPath: '/fallback-blocking/on-demand-2', query: '?another=value' },
      ],
    },
  ])('$title', async ({ pathsToCheck }) => {
    let initialRandom;
    let initialRandomData;
    let preRevalidateRandom;
    let preRevalidateRandomData;

    const checkPaths = async pathsToCheck => {
      for (const { urlPath, query } of pathsToCheck) {
        console.log('checking', {
          urlPath,
          query,
          initialRandom,
          preRevalidateRandom,
        });

        if (preRevalidateRandom) {
          // wait for change as cache may take a little to propagate
          const initialUrl = `${ctx.deploymentUrl}${urlPath}${query || ''}`;
          await checkForChange(initialUrl, preRevalidateRandom, async () => {
            const res = await fetch(initialUrl);
            const $ = cheerio.load(await res.text());
            return JSON.parse($('#props').text()).random;
          });
        }

        const res = await fetch(`${ctx.deploymentUrl}${urlPath}${query || ''}`);
        expect(res.status).toBe(200);

        const $ = await cheerio.load(await res.text());
        const props = JSON.parse($('#props').text());

        if (initialRandom) {
          // for fallback paths the initial value is generated
          // in the foreground and then a revalidation is kicked off
          // in the background so the initial value will be replaced
          if (initialRandom !== props.random && urlPath.includes('on-demand')) {
            initialRandom = props.random;
          } else {
            expect(initialRandom).toBe(props.random);
          }
        } else {
          initialRandom = props.random;
        }
        expect(isNaN(initialRandom)).toBe(false);

        const dataRes = await fetch(
          `${ctx.deploymentUrl}/_next/data/testing-build-id${urlPath}.json${
            query || ''
          }`
        );
        expect(dataRes.status).toBe(200);

        const { pageProps: dataProps } = await dataRes.json();

        if (initialRandomData) {
          // for fallback paths the initial value is generated
          // in the foreground and then a revalidation is kicked off
          // in the background so the initial value will be replaced
          if (
            initialRandomData !== dataProps.random &&
            urlPath.includes('on-demand-2')
          ) {
            initialRandomData = dataProps.random;
          } else {
            expect(initialRandomData).toBe(dataProps.random);
          }
        } else {
          initialRandomData = dataProps.random;
        }
        expect(isNaN(initialRandomData)).toBe(false);
      }
    };

    await checkPaths(pathsToCheck);

    preRevalidateRandom = initialRandom;
    preRevalidateRandomData = initialRandomData;

    initialRandom = undefined;
    initialRandomData = undefined;

    const revalidateRes = await fetch(
      `${ctx.deploymentUrl}/api/revalidate?urlPath=${pathsToCheck[0].urlPath}`
    );
    expect(revalidateRes.status).toBe(200);
    expect((await revalidateRes.json()).revalidated).toBe(true);

    await checkPaths(pathsToCheck);

    expect(preRevalidateRandom).toBeDefined();
    expect(preRevalidateRandomData).toBeDefined();
  });

  it('should revalidate 404 page itself correctly', async () => {
    const initial404 = await fetch(`${ctx.deploymentUrl}/404`);
    const initial404Html = await initial404.text();
    const initial404Props = JSON.parse(
      cheerio.load(initial404Html)('#props').text()
    );
    expect(initial404.status).toBe(404);
    expect(initial404Props.is404).toBe(true);

    const revalidateRes = await fetch(
      `${ctx.deploymentUrl}/api/revalidate?urlPath=/404`
    );
    expect(revalidateRes.status).toBe(200);
    expect(await revalidateRes.json()).toEqual({ revalidated: true });

    await check(async () => {
      const res = await fetch(`${ctx.deploymentUrl}/404`);
      const resHtml = await res.text();
      const resProps = JSON.parse(cheerio.load(resHtml)('#props').text());
      expect(res.status).toBe(404);
      expect(resProps.is404).toBe(true);
      expect(resProps.time).not.toEqual(initial404Props.time);
      return 'success';
    }, 'success');
  });
});
