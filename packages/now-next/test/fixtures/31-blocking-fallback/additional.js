/* eslint-env jest */
const fetch = require('node-fetch');
const cheerio = require('cheerio');

module.exports = function (ctx) {
  it('should revalidate content properly from dynamic pathname', async () => {
    // wait for revalidation to expire
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res = await fetch(`${ctx.deploymentUrl}/regenerated/blue`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const initialTime = $('#time').text();
    expect($('#slug').text()).toBe('blue');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/regenerated/blue`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    expect($('#slug').text()).toBe('blue');
    expect(initialTime).not.toBe($('#time').text());
  });

  it('should revalidate content properly from /_next/data dynamic pathname', async () => {
    // wait for revalidation to expire
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/regenerated/blue.json`
    );
    expect(res.status).toBe(200);

    const { pageProps: data } = await res.json();
    const initialTime = data.time;
    expect(data.slug).toBe('blue');
    expect(isNaN(initialTime)).toBe(false);

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/regenerated/blue.json`
    );
    expect(res2.status).toBe(200);

    const { pageProps: data2 } = await res2.json();
    expect(data2.slug).toBe('blue');
    expect(initialTime).not.toBe(data2.time);
  });
};
