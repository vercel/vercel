/* eslint-env jest */
const fetch = require('node-fetch');
const cheerio = require('cheerio');

module.exports = function (ctx) {
  it('should revalidate content properly from /', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/fr`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/fr`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('nl-NL');
  });

  it('should revalidate content properly from /gsp/fallback/new-page', async () => {
    const initRes = await fetch(`${ctx.deploymentUrl}/gsp/fallback/new-page`);
    expect(initRes.status).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const res = await fetch(`${ctx.deploymentUrl}/gsp/fallback/new-page`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    console.log({ props: $('#props').text(), html });
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/gsp/fallback/new-page`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr/gsp/fallback/new-page', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/fr/gsp/fallback/new-page.json`
    );
    expect(dataRes.status).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const res = await fetch(`${ctx.deploymentUrl}/fr/gsp/fallback/new-page`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    console.log({ props: $('#props').text(), html });
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/fr/gsp/fallback/new-page`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL/gsp/fallback/new-page', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/nl-NL/gsp/fallback/new-page.json`
    );
    expect(dataRes.status).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const res = await fetch(`${ctx.deploymentUrl}/nl-NL/gsp/fallback/new-page`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    console.log({ props: $('#props').text(), html });
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(
      `${ctx.deploymentUrl}/nl-NL/gsp/fallback/new-page`
    );
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('nl-NL');
  });

  it('should revalidate content properly from /gsp/no-fallback/first', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/gsp/no-fallback/first`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/gsp/no-fallback/first`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr/gsp/no-fallback/first', async () => {
    const res = await fetch(`${ctx.deploymentUrl}/fr/gsp/no-fallback/first`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(`${ctx.deploymentUrl}/fr/gsp/no-fallback/first`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL/gsp/no-fallback/second', async () => {
    const res = await fetch(
      `${ctx.deploymentUrl}/nl-NL/gsp/no-fallback/second`
    );
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 2000));

    const res2 = await fetch(
      `${ctx.deploymentUrl}/nl-NL/gsp/no-fallback/second`
    );
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('nl-NL');
  });
};
