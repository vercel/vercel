import { describe, it, expect } from 'vitest';
import { prepareFilesystem } from '../test-utils';
import { build } from '../../../src';

describe('middleware matchers', () => {
  it.each([
    {
      title: 'has catch-all route whithout matcher',
      matcher: undefined,
      regExps: ['^/.*$'],
    },
    {
      title: 'handles / and /index with / matcher',
      matcher: '/',
      regExps: ['^\\/[\\/#\\?]?$', '^\\/index[\\/#\\?]?$'],
    },
    {
      title: 'handles as many routes as provided matchers',
      matcher: ['/about', '/posts'],
      regExps: ['^\\/about[\\/#\\?]?$', '^\\/posts[\\/#\\?]?$'],
    },
    {
      title: 'handles /index on multiple routes',
      matcher: ['/about/:slug', '/'],
      regExps: [
        '^\\/about(?:\\/([^\\/#\\?]+?))[\\/#\\?]?$',
        '^\\/[\\/#\\?]?$',
        '^\\/index[\\/#\\?]?$',
      ],
    },
    {
      title: 'do not duplicates /index if already present',
      matcher: ['/about/:slug', '/index', '/'],
      regExps: [
        '^\\/about(?:\\/([^\\/#\\?]+?))[\\/#\\?]?$',
        '^\\/index[\\/#\\?]?$',
        '^\\/[\\/#\\?]?$',
      ],
    },
  ])('$title', async ({ matcher, regExps }) => {
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
        middlewareRawSrc:
          matcher === undefined
            ? []
            : Array.isArray(matcher)
              ? matcher
              : [matcher],
        middlewarePath: 'middleware.js',
        continue: true,
        override: true,
      },
    ]);
  });

  it('uses an explicit proxy matcher from the builder config', async () => {
    const filesystem = await prepareFilesystem({
      'proxy.js': `
        export default () => new Response('proxy');
      `,
    });
    const buildResult = await build({
      ...filesystem,
      entrypoint: 'proxy.js',
      config: {
        middleware: true,
        middlewareRuntime: 'nodejs',
        middlewareMatcher: '/api/:func*',
      },
      meta: { skipDownload: true },
    });

    expect(buildResult.routes).toEqual([
      {
        src: '^\\/api(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?[\\/#\\?]?$',
        middlewareRawSrc: ['/api/:func*'],
        middlewarePath: 'proxy.js',
        continue: true,
        override: true,
      },
    ]);
  });

  it('rejects a matcher configured in both source and builder config', async () => {
    const filesystem = await prepareFilesystem({
      'proxy.js': `
        export const config = { matcher: '/from-source' };
        export default () => new Response('proxy');
      `,
    });

    await expect(
      build({
        ...filesystem,
        entrypoint: 'proxy.js',
        config: {
          middleware: true,
          middlewareRuntime: 'nodejs',
          middlewareMatcher: '/from-vercel-json',
        },
        meta: { skipDownload: true },
      })
    ).rejects.toThrow(
      'proxy.js: `proxy.matcher` in vercel.json conflicts with `config.matcher` exported from the proxy entrypoint. Configure the matcher in only one location.'
    );
  });
});
