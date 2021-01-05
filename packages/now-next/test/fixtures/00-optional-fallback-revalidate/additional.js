/* eslint-env jest */
const fetch = require('../../../../../test/lib/deployment/fetch-retry');
const cheerio = require('cheerio');
const { waitFor, check } = require('../../utils');

module.exports = function (ctx) {
  const getProps = async path => {
    const html = await fetch(`${ctx.deploymentUrl}/${path}`).then(res =>
      res.text()
    );

    const $ = cheerio.load(html);
    return JSON.parse($('#props').text());
  };

  const getInitialData = async path => {
    return fetch(
      `${ctx.deploymentUrl}/_next/data/testing-build-id${path}.json`
    ).then(res => res.json());
  };

  async function checkForChange(url, initialValue, hardError) {
    return check(
      async () => {
        const props = await getProps(url);

        if (isNaN(props.random)) {
          throw new Error(`Invalid random value ${props.random}`);
        }
        const newValue = props.random;
        return initialValue !== newValue ? 'success' : 'fail';
      },
      'success',
      hardError
    );
  }

  it('should render / correctly', async () => {
    const props = await getInitialData('');
    expect(props.pageProps.params).toEqual({});

    await waitFor(2000);
    await getProps('/');

    const newProps = await getProps('/');
    expect(newProps.params).toEqual({});
    await checkForChange('/', props.pageProps.random);
  });

  it('should render /a correctly', async () => {
    const props = await getInitialData('/a');
    expect(props.pageProps.params).toEqual({ slug: ['a'] });

    await waitFor(2000);
    await getProps('/a');

    const newProps = await getProps('/a');
    expect(newProps.params).toEqual({ slug: ['a'] });
    await checkForChange('/a', props.pageProps.random);
  });

  it('should render /hello/world correctly', async () => {
    const props = await getInitialData('/hello/world');
    expect(props.pageProps.params).toEqual({ slug: ['hello', 'world'] });

    await waitFor(2000);
    await getProps('/hello/world');

    const newProps = await getProps('/hello/world');
    expect(newProps.params).toEqual({ slug: ['hello', 'world'] });
    await checkForChange('/hello/world', props.pageProps.random);
  });

  it('should render /posts correctly', async () => {
    const props = await getInitialData('/posts');
    expect(props.pageProps.params).toEqual({});

    await waitFor(2000);
    await getProps('/posts');

    const newProps = await getProps('/posts');
    expect(newProps.params).toEqual({});
    await checkForChange('/posts', props.pageProps.random);
  });

  it('should render /posts/a correctly', async () => {
    const props = await getInitialData('/posts/a');
    expect(props.pageProps.params).toEqual({ slug: ['a'] });

    await waitFor(2000);
    await getProps('/posts/a');

    const newProps = await getProps('/posts/a');
    expect(newProps.params).toEqual({ slug: ['a'] });
    await checkForChange('/posts/a', props.pageProps.random);
  });

  it('should render /posts/hello/world correctly', async () => {
    const props = await getInitialData('/posts/hello/world');
    expect(props.pageProps.params).toEqual({ slug: ['hello', 'world'] });

    await waitFor(2000);
    await getProps('/posts/hello/world');

    const newProps = await getProps('/posts/hello/world');
    expect(newProps.params).toEqual({ slug: ['hello', 'world'] });
    await checkForChange('/posts/hello/world', props.pageProps.random);
  });
};
