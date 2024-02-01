import { normalizeURL } from '../../../../src/util/bisect/normalize-url';

describe('normalize-url', () => {
  it('should add https to url without scheme', () => {
    const normalizedUrl = normalizeURL('vercel.com');
    expect(normalizedUrl).toEqual('https://vercel.com');
  });
  it('should not add anything to a url that starts with https', () => {
    const normalizedUrl = normalizeURL('https://vercel.com');
    expect(normalizedUrl).toEqual('https://vercel.com');
  });
  it('should not add anything to a url that starts with http', () => {
    const normalizedUrl = normalizeURL('http://vercel.com');
    expect(normalizedUrl).toEqual('http://vercel.com');
  });
});
