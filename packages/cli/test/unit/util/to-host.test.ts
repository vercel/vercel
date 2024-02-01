import toHost from '../../../src/util/to-host';

describe('toHost', () => {
  it('should parse simple to host', () => {
    expect(toHost('vercel.com')).toEqual('vercel.com');
  });

  it('should parse leading // to host', () => {
    expect(toHost('//zeit-logos-rnemgaicnc.now.sh')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse leading http:// to host', () => {
    expect(toHost('http://zeit-logos-rnemgaicnc.now.sh')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse leading https:// to host', () => {
    expect(toHost('https://zeit-logos-rnemgaicnc.now.sh')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse leading https:// and path to host', () => {
    expect(toHost('https://zeit-logos-rnemgaicnc.now.sh/path')).toEqual(
      'zeit-logos-rnemgaicnc.now.sh'
    );
  });

  it('should parse simple and path to host', () => {
    expect(toHost('vercel.com/test')).toEqual('vercel.com');
  });
});
