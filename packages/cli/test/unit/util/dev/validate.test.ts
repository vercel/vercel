import { validateConfig } from '../../../../src/util/validate-config';

describe('validateConfig', () => {
  it('should not error with empty config', async () => {
    const config = {};
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should not error with complete config', async () => {
    const config = {
      version: 2,
      public: true,
      regions: ['sfo1', 'iad1'],
      cleanUrls: true,
      headers: [{ source: '/', headers: [{ key: 'x-id', value: '123' }] }],
      rewrites: [{ source: '/help', destination: '/support' }],
      redirects: [{ source: '/kb', destination: 'https://example.com' }],
      trailingSlash: false,
      functions: { 'api/user.go': { memory: 128, maxDuration: 5 } },
    };
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should not error with builds and routes', async () => {
    const config = {
      builds: [{ src: 'api/index.js', use: '@vercel/node' }],
      routes: [{ src: '/(.*)', dest: '/api/index.js' }],
    };
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should error with invalid rewrites due to additional property and offer suggestion', async () => {
    const error = validateConfig({
      // @ts-ignore
      rewrites: [{ src: '/(.*)', dest: '/api/index.js' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `rewrites[0]` should NOT have additional property `src`. Did you mean `source`?'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/rewrites'
    );
  });

  it('should error with invalid routes due to additional property and offer suggestion', async () => {
    const error = validateConfig({
      // @ts-ignore
      routes: [{ source: '/(.*)', destination: '/api/index.js' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `routes[0]` should NOT have additional property `source`. Did you mean `src`?'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/routes'
    );
  });

  it('should error with invalid routes array type', async () => {
    const error = validateConfig({
      // @ts-ignore
      routes: { src: '/(.*)', dest: '/api/index.js' },
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `routes` should be array.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/routes'
    );
  });

  it('should error with invalid redirects array object', async () => {
    const error = validateConfig({
      redirects: [
        // @ts-ignore
        {
          /* intentionally empty */
        },
      ],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `redirects[0]` missing required property `source`.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/redirects'
    );
  });

  it('should error with invalid redirects.permanent poperty', async () => {
    const error = validateConfig({
      // @ts-ignore
      redirects: [{ source: '/', destination: '/go', permanent: 'yes' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `redirects[0].permanent` should be boolean.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/redirects'
    );
  });

  it('should error with invalid cleanUrls type', async () => {
    const error = validateConfig({
      // @ts-ignore
      cleanUrls: 'true',
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `cleanUrls` should be boolean.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/cleanurls'
    );
  });

  it('should error with invalid trailingSlash type', async () => {
    const error = validateConfig({
      // @ts-ignore
      trailingSlash: [true],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `trailingSlash` should be boolean.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/trailingslash'
    );
  });

  it('should error with invalid headers property', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ 'Content-Type': 'text/html' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/headers'
    );
  });

  it('should error with invalid headers.source type', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ source: [{ 'Content-Type': 'text/html' }] }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0].source` should be string.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/headers'
    );
  });

  it('should error with invalid headers additional property', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ source: '/', stuff: [{ 'Content-Type': 'text/html' }] }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0]` should NOT have additional property `stuff`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/headers'
    );
  });

  it('should error with invalid headers wrong nested headers type', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ source: '/', headers: [{ 'Content-Type': 'text/html' }] }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0].headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/headers'
    );
  });

  it('should error with invalid headers wrong nested headers additional property', async () => {
    const error = validateConfig({
      headers: [
        // @ts-ignore
        { source: '/', headers: [{ key: 'Content-Type', val: 'text/html' }] },
      ],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0].headers[0]` should NOT have additional property `val`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/headers'
    );
  });

  it('should error with too many redirects', async () => {
    const error = validateConfig({
      redirects: Array.from({ length: 5000 }).map((_, i) => ({
        source: `/${i}`,
        destination: `/v/${i}`,
      })),
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `redirects` should NOT have more than 1024 items.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/redirects'
    );
  });

  it('should error with too many nested headers', async () => {
    const error = validateConfig({
      headers: [
        {
          source: '/',
          headers: [{ key: `x-id`, value: `123` }],
        },
        {
          source: '/too-many',
          headers: Array.from({ length: 5000 }).map((_, i) => ({
            key: `${i}`,
            value: `${i}`,
          })),
        },
      ],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[1].headers` should NOT have more than 1024 items.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/configuration#project/headers'
    );
  });

  it('should error with "functions" and "builds"', async () => {
    const error = validateConfig({
      builds: [
        {
          src: 'index.html',
          use: '@vercel/static',
        },
      ],
      functions: {
        'api/test.js': {
          memory: 1024,
        },
      },
    });
    expect(error!.message).toEqual(
      'The `functions` property cannot be used in conjunction with the `builds` property. Please remove one of them.'
    );

    expect(error!.link).toEqual('https://vercel.link/functions-and-builds');
  });
});
