/* eslint-env jest */
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const waitFor = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = function (ctx) {
  const getProps = async path => {
    const html = await fetch(`${ctx.deploymentUrl}/${path}`).then(res =>
      res.text()
    );

    const $ = cheerio.load(html);
    return JSON.parse($('#props').text());
  };

  it('should render / correctly', async () => {
    const props = await getProps('/', { params: {} });
    expect(props.params).toEqual({});

    await waitFor(2000);
    await getProps('/');

    const newProps = await getProps('/', { params: {} });
    expect(newProps.params).toEqual({});
    expect(props.random).not.toBe(newProps.random);
  });

  it('should render /index correctly', async () => {
    const props = await getProps('/index');
    expect(props.params).toEqual({});

    await waitFor(2000);
    await getProps('/index');

    const newProps = await getProps('/index');
    expect(newProps.params).toEqual({});
    expect(props.random).not.toBe(newProps.random);
  });

  it('should render /a correctly', async () => {
    const props = await getProps('/a');
    expect(props.params).toEqual({ slug: ['a'] });

    await waitFor(2000);
    await getProps('/a');

    const newProps = await getProps('/a');
    expect(newProps.params).toEqual({ slug: ['a'] });
    expect(props.random).not.toBe(newProps.random);
  });

  it('should render /hello/world correctly', async () => {
    const props = await getProps('/hello/world');
    expect(props.params).toEqual({ slug: ['hello', 'world'] });

    await waitFor(2000);
    await getProps('/hello/world');

    const newProps = await getProps('/hello/world');
    expect(newProps.params).toEqual({ slug: ['hello', 'world'] });
    expect(props.random).not.toBe(newProps.random);
  });
};
