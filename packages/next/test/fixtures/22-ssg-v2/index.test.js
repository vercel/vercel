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

    return initialValue !== newValue ? 'success' : 'fail';
  }, 'success');
}

const ctx = {};

describe(`${__dirname.split(path.sep).pop()}`, () => {
  it('should deploy and pass probe checks', async () => {
    const info = await deployAndTest(__dirname);
    Object.assign(ctx, info);
  });

  it('should revalidate content properly from pathname', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/another`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const initialTime = $('#time').text();
    const initialRandom = $('#random').text();
    expect($('#hello').text()).toBe('hello: world');

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/another`,
      initialRandom,
      async res => {
        const $ = cheerio.load(await res.text());
        return $('#random').text();
      }
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/another`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#hello').text()).toBe('hello: world');
  });

  it('should revalidate content properly from dynamic pathname', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/blog/post-123`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const initialTime = $('#time').text();
    const initialRandom = $('#random').text();
    expect($('#post').text()).toBe('Post: post-123');

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/blog/post-123`,
      initialRandom,
      async res => {
        const $ = cheerio.load(await res.text());
        return $('#random').text();
      }
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/blog/post-123`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#post').text()).toBe('Post: post-123');
  });

  it('should revalidate content properly from non-utf8 dynamic pathname', async () => {
    const slug = 'こんにちは';
    const encodedSlug = encodeURIComponent(slug);
    const res = await fetch(`${ctx.deploymentUrl}/blog/${encodedSlug}`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const initialTime = $('#time').text();
    const initialRandom = $('#random').text();
    expect($('#post').text()).toBe(`Post: ${slug}`);

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/blog/${encodedSlug}`,
      initialRandom,
      async res => {
        const $ = cheerio.load(await res.text());
        return $('#random').text();
      }
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/blog/${encodedSlug}`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#post').text()).toBe(`Post: ${slug}`);
  });

  it('should revalidate content properly from dynamic pathnames', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/blog/post-123/comment-321`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const initialTime = $('#time').text();
    const initialRandom = $('#random').text();
    expect($('#post').text()).toBe('Post: post-123');
    expect($('#comment').text()).toBe('Comment: comment-321');

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/blog/post-123/comment-321`,
      initialRandom,
      async res => {
        const $ = cheerio.load(await res.text());
        return $('#random').text();
      }
    );

    const res2 = await fetch(`${ctx.deploymentUrl}/blog/post-123/comment-321`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#post').text()).toBe('Post: post-123');
    expect($('#comment').text()).toBe('Comment: comment-321');
  });

  it('should revalidate content properly from /_next/data pathname', async () => {
    const res = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/another.json`
    );
    expect(res.status).toBe(200);

    const { pageProps: data } = await res.json();
    const initialTime = data.time;
    const initialRandom = data.random;
    expect(data.world).toBe('world');
    expect(isNaN(initialTime)).toBe(false);
    expect(isNaN(initialRandom)).toBe(false);

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/another.json`,
      initialRandom,
      async res => {
        const { pageProps: data } = await res.json();
        return data.random;
      }
    );

    const res2 = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/another.json`
    );
    expect(res2.status).toBe(200);

    const { pageProps: data2 } = await res2.json();
    expect(data2.world).toBe('world');
    expect(isNaN(data2.time)).toBe(false);
    expect(isNaN(data2.random)).toBe(false);
  });

  it('should revalidate content properly from /_next/data dynamic pathname', async () => {
    const res = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/post-123.json`
    );
    expect(res.status).toBe(200);

    const { pageProps: data } = await res.json();
    const initialTime = data.time;
    const initialRandom = data.random;
    expect(data.post).toBe('post-123');
    expect(isNaN(initialTime)).toBe(false);
    expect(isNaN(initialRandom)).toBe(false);

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/post-123.json`,
      initialRandom,
      async res => {
        const { pageProps: data } = await res.json();
        return data.random;
      }
    );

    const res2 = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/post-123.json`
    );
    expect(res2.status).toBe(200);

    const { pageProps: data2 } = await res2.json();
    expect(data2.post).toBe('post-123');
    expect(isNaN(data2.time)).toBe(false);
    expect(isNaN(data2.random)).toBe(false);
  });

  it('should revalidate content properly from /_next/data dynamic pathnames', async () => {
    const res = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/post-123/comment-321.json`
    );
    expect(res.status).toBe(200);

    const { pageProps: data } = await res.json();
    const initialTime = data.time;
    const initialRandom = data.random;
    expect(data.post).toBe('post-123');
    expect(data.comment).toBe('comment-321');
    expect(isNaN(initialTime)).toBe(false);
    expect(isNaN(initialRandom)).toBe(false);

    // wait for revalidation to occur
    await checkForChange(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/post-123/comment-321.json`,
      initialRandom,
      async res => {
        const { pageProps: data } = await res.json();
        return data.random;
      }
    );

    const res2 = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/blog/post-123/comment-321.json`
    );
    expect(res2.status).toBe(200);

    const { pageProps: data2 } = await res2.json();
    expect(data2.post).toBe('post-123');
    expect(data2.comment).toBe('comment-321');
    expect(isNaN(data2.time)).toBe(false);
    expect(isNaN(data2.random)).toBe(false);
  });
});
