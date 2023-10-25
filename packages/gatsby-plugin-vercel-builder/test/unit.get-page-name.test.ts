import { getPageName } from '../templates/utils';

describe('getPageName()', () => {
  it.each([
    {
      input: '/page-data/index/page-data.json',
      pageName: '/',
      isPageData: true,
    },
    {
      input: '/page-data/using-ssr/page-data.json',
      pageName: 'using-ssr',
      isPageData: true,
    },
    { input: '/', pageName: '/', isPageData: false },
    { input: '/index.html', pageName: '/', isPageData: false },
    { input: '/using-ssr', pageName: 'using-ssr', isPageData: false },
    { input: '/using-ssr/', pageName: 'using-ssr', isPageData: false },
    {
      input: '/using-ssr/index.html',
      pageName: 'using-ssr',
      isPageData: false,
    },
    { input: '/foo/bar/ssr', pageName: 'foo/bar/ssr', isPageData: false },
    {
      input: '/page-data/foo/bar/ssr/page-data.json',
      pageName: 'foo/bar/ssr',
      isPageData: true,
    },

    { input: '/foo/', pathPrefix: '/foo', pageName: '/', isPageData: false },
    {
      input: '/foo/index.html',
      pathPrefix: '/foo',
      pageName: '/',
      isPageData: false,
    },
    {
      input: '/foo/bar/ssr',
      pathPrefix: '/foo/',
      pageName: 'bar/ssr',
      isPageData: false,
    },
    {
      input: '/foo/page-data/index/page-data.json',
      pathPrefix: '/foo',
      pageName: '/',
      isPageData: true,
    },
    {
      input: '/foo/page-data/bar/ssr/page-data.json',
      pathPrefix: '/foo',
      pageName: 'bar/ssr',
      isPageData: true,
    },
  ])(
    'Should return "$pageName" for "$input"',
    ({ input, pathPrefix, pageName, isPageData }) => {
      const actual = getPageName(input, pathPrefix);
      expect(actual.pathName).toEqual(pageName);
      expect(actual.isPageData).toEqual(isPageData);
    }
  );
});
