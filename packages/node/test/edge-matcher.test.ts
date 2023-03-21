import { prepareFilesystem } from './test-utils';
import { build } from '../src';

describe('middleware matchers', () => {
  it.each([
    {
      title: 'has catch-all route whithout matcher',
      matcher: undefined,
      middlewareRawSrc: [],
      regExps: ['^/.*$'],
    },
    {
      title: 'handles / and /index with / matcher',
      matcher: '/',
      middlewareRawSrc: ['/'],
      regExps: ['^\\/[\\/#\\?]?$', '^\\/index[\\/#\\?]?$'],
    },
    {
      title: 'handles as many routes as provided matchers',
      matcher: ['/about', '/posts'],
      middlewareRawSrc: ['/about', '/posts'],
      regExps: ['^\\/about[\\/#\\?]?$', '^\\/posts[\\/#\\?]?$'],
    },
    {
      title: 'handles /index on multiple routes',
      matcher: ['/about/:slug', '/'],
      middlewareRawSrc: ['/about/:slug', '/'],
      regExps: [
        '^\\/about(?:\\/([^\\/#\\?]+?))[\\/#\\?]?$',
        '^\\/[\\/#\\?]?$',
        '^\\/index[\\/#\\?]?$',
      ],
    },
    {
      title: 'do not duplicates /index if already present',
      matcher: ['/about/:slug', '/index', '/'],
      middlewareRawSrc: ['/about/:slug', '/index', '/'],
      regExps: [
        '^\\/about(?:\\/([^\\/#\\?]+?))[\\/#\\?]?$',
        '^\\/index[\\/#\\?]?$',
        '^\\/[\\/#\\?]?$',
      ],
    },
  ])('$title', async ({ matcher, middlewareRawSrc, regExps }) => {
    const filesystem = await prepareFilesystem({
      'middleware.js': `
        export default (req) => {
          return new Response('hooked!', {
            headers: { 'x-got-middleware': 'true' },
          });
        };

        ${
          matcher
            ? `export const config = { matcher: ${JSON.stringify(matcher)} };`
            : ''
        }
      `,
    });
    const buildResult = await build({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: {
        middleware: true,
      },
      meta: { skipDownload: true },
    });
    expect(buildResult.routes).toEqual([
      {
        src: regExps.join('|'),
        middlewarePath: 'middleware.js',
        middlewareRawSrc,
        continue: true,
        override: true,
      },
    ]);
  });
});
