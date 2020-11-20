/* eslint-env jest */
const fetch = require('node-fetch');
const cheerio = require('cheerio');

module.exports = function (ctx) {
  it('should revalidate content properly from /', async () => {
    // we have to hit the _next/data URL first
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

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 4000));

    const res2 = await fetch(`${ctx.deploymentUrl}/`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr', async () => {
    // we have to hit the _next/data URL first
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

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 4000));

    const res2 = await fetch(`${ctx.deploymentUrl}/fr`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/nl-NL/index.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    const res = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res.status).toBe(200);

    let $ = cheerio.load(await res.text());
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 4000));

    const res2 = await fetch(`${ctx.deploymentUrl}/nl-NL`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('nl-NL');
  });

  it('should revalidate content properly from /second', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/en-US/second.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    await new Promise(resolve => setTimeout(resolve, 4000));

    const res = await fetch(`${ctx.deploymentUrl}/second`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('en-US');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 4000));

    const res2 = await fetch(`${ctx.deploymentUrl}/second`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('en-US');
  });

  it('should revalidate content properly from /fr/second', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/fr/second.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    await new Promise(resolve => setTimeout(resolve, 4000));

    const res = await fetch(`${ctx.deploymentUrl}/fr/second`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('fr');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 4000));

    const res2 = await fetch(`${ctx.deploymentUrl}/fr/second`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('fr');
  });

  it('should revalidate content properly from /nl-NL/second', async () => {
    // we have to hit the _next/data URL first
    const dataRes = await fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id/nl-NL/second.json`
    );
    expect(dataRes.status).toBe(200);
    await dataRes.json();

    await new Promise(resolve => setTimeout(resolve, 4000));

    const res = await fetch(`${ctx.deploymentUrl}/nl-NL/second`);
    expect(res.status).toBe(200);

    const html = await res.text();
    let $ = cheerio.load(html);
    const props = JSON.parse($('#props').text());
    const initialRandom = props.random;
    expect($('#router-locale').text()).toBe('nl-NL');

    // wait for revalidation to occur
    await new Promise(resolve => setTimeout(resolve, 4000));

    const res2 = await fetch(`${ctx.deploymentUrl}/nl-NL/second`);
    expect(res2.status).toBe(200);

    $ = cheerio.load(await res2.text());
    const props2 = JSON.parse($('#props').text());
    expect(initialRandom).not.toBe(props2.random);
    expect($('#router-locale').text()).toBe('nl-NL');
  });
};
