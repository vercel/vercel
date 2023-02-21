import { getRegExpFromPath } from '../src/utils';

describe('getRegExpFromPath()', () => {
  describe('paths without parameters', () => {
    it.each([{ path: 'index' }, { path: 'api/hello' }, { path: 'projects' }])(
      'should return `false` for "$path"',
      ({ path }) => {
        expect(getRegExpFromPath(path)).toEqual(false);
      }
    );
  });

  describe.each([
    {
      path: '*',
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
      path: 'projects/*',
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
          url: '/projects/foo',
          expected: true,
        },
        {
          url: '/projects/another',
          expected: true,
        },
      ],
    },
    {
      path: ':foo',
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
      path: 'blog/:id/edit',
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
  ])('with path "$path"', ({ path, urls }) => {
    const re = getRegExpFromPath(path) as RegExp;

    it('should return RegExp', () => {
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
