import { getHugoUrl } from '../src/utils/hugo';

describe('getHugoUrl()', () => {
  it('should return URL for v0.42.2 on macOS arm64', async () => {
    const url = await getHugoUrl('0.42.2', 'darwin', 'arm64');
    expect(url).toEqual(
      'https://github.com/gohugoio/hugo/releases/download/v0.42.2/hugo_0.42.2_macOS-64bit.tar.gz'
    );
  });

  it('should return URL for v0.42.2 on Linux x64', async () => {
    const url = await getHugoUrl('0.42.2', 'linux', 'x64');
    expect(url).toEqual(
      'https://github.com/gohugoio/hugo/releases/download/v0.42.2/hugo_0.42.2_Linux-64bit.tar.gz'
    );
  });

  it('should return URL for v0.58.2 on macOS arm64', async () => {
    const url = await getHugoUrl('0.58.2', 'darwin', 'arm64');
    expect(url).toEqual(
      'https://github.com/gohugoio/hugo/releases/download/v0.58.2/hugo_extended_0.58.2_macOS-64bit.tar.gz'
    );
  });

  it('should return URL for v0.58.2 on Linux x64', async () => {
    const url = await getHugoUrl('0.58.2', 'linux', 'x64');
    expect(url).toEqual(
      'https://github.com/gohugoio/hugo/releases/download/v0.58.2/hugo_extended_0.58.2_Linux-64bit.tar.gz'
    );
  });

  it('should return URL for v0.125.0 on macOS arm64', async () => {
    const url = await getHugoUrl('0.125.0', 'darwin', 'arm64');
    expect(url).toEqual(
      'https://github.com/gohugoio/hugo/releases/download/v0.125.0/hugo_extended_0.125.0_darwin-universal.tar.gz'
    );
  });

  it('should return URL for v0.125.0 on Linux x64', async () => {
    const url = await getHugoUrl('0.125.0', 'linux', 'x64');
    expect(url).toEqual(
      'https://github.com/gohugoio/hugo/releases/download/v0.125.0/hugo_extended_0.125.0_Linux-64bit.tar.gz'
    );
  });
});
