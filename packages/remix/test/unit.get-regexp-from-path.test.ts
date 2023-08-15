import { getRegExpFromPath } from '../src/utils';

describe('getRegExpFromPath()', () => {
  describe('paths without parameters', () => {
    it.each([
      { path: '/index' },
      { path: '/api/hello' },
      { path: '/projects' },
    ])('should return `false` for "$path"', ({ path }) => {
      expect(getRegExpFromPath(path)).toEqual(false);
    });
  });

  describe.each([
    {
      path: '/:params*',
      urls: [
        {
          url: '/',
          expected: true,
        },
        {
          url: '/foo',
          expected: true,
        },
        {
          url: '/projects/foo',
          expected: true,
        },
        {
          url: '/projects/another',
          expected: true,
        },
        {
          url: '/to/infinity/and/beyond',
          expected: true,
        },
      ],
    },
    {
      path: '/projects/:params*',
      urls: [
        {
          url: '/',
          expected: false,
        },
        {
          url: '/foo',
          expected: false,
        },
        {
          url: '/projects',
          expected: true,
        },
        {
          url: '/projects/',
          expected: true,
        },
        {
          url: '/projects/foo',
          expected: true,
        },
        {
          url: '/projects/foo/another',
          expected: true,
        },
      ],
    },
    {
      path: '/:foo',
      urls: [
        {
          url: '/',
          expected: false,
        },
        {
          url: '/foo',
          expected: true,
        },
        {
          url: '/projects/foo',
          expected: false,
        },
        {
          url: '/projects/another',
          expected: false,
        },
      ],
    },
    {
      path: '/blog/:id/edit',
      urls: [
        {
          url: '/',
          expected: false,
        },
        {
          url: '/foo',
          expected: false,
        },
        {
          url: '/blog/123/edit',
          expected: true,
        },
        {
          url: '/blog/456/edit',
          expected: true,
        },
        {
          url: '/blog/123/456/edit',
          expected: false,
        },
        {
          url: '/blog/123/another',
          expected: false,
        },
      ],
    },
    {
      path: '/:lang?',
      urls: [
        {
          url: '/',
          expected: true,
        },
        {
          url: '/en',
          expected: true,
        },
        {
          url: '/en/other',
          expected: false,
        },
      ],
    },
    {
      path: '/:lang?/other',
      urls: [
        {
          url: '/other',
          expected: true,
        },
        {
          url: '/en/other',
          expected: true,
        },
        {
          url: '/',
          expected: false,
        },
        {
          url: '/another',
          expected: false,
        },
      ],
    },
    {
      path: '/:lang?/:pid',
      urls: [
        {
          url: '/123',
          expected: true,
        },
        {
          url: '/en/123',
          expected: true,
        },
        {
          url: '/',
          expected: false,
        },
        {
          url: '/en/foo/bar',
          expected: false,
        },
      ],
    },
    {
      path: '/admin/(lol)?',
      urls: [
        {
          url: '/admin',
          expected: true,
        },
        {
          url: '/admin/lol',
          expected: true,
        },
        {
          url: '/other',
          expected: false,
        },
        {
          url: '/admin/other',
          expected: false,
        },
      ],
    },
  ])('with path "$path"', ({ path, urls }) => {
    const re = getRegExpFromPath(path) as RegExp;

    it.skip('should return RegExp', () => {
      expect(re).toBeInstanceOf(RegExp);
    });

    it.each(urls)(
      'should match URL "$url" - $expected',
      ({ url, expected }) => {
        expect(re.test(url)).toEqual(expected);
      }
    );
  });
});
