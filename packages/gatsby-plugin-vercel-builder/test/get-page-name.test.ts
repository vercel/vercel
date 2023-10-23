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
  ])(
    'Should return "$pageName" for "$input"',
    ({ input, pageName, isPageData }) => {
      const actual = getPageName(input);
      expect(actual.pathName).toEqual(pageName);
      expect(actual.isPageData).toEqual(isPageData);
    }
  );
});
