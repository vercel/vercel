import { parseGoModVersion } from '../src/go-helpers';

describe('parseGoModVersion', function () {
  it('returns undefined with empty string', async () => {
    const version = parseGoModVersion('');
    expect(version).toBeUndefined();
  });
  it('returns exactly same version if patch exists', async () => {
    const version = parseGoModVersion('go 1.16.1');
    expect(version).toEqual('1.16.1');
  });
  it('returns the latest patch version if patch dose not exists', async () => {
    const version = parseGoModVersion('go 1.16');
    expect(version).toEqual('1.16.15');
  });
  it('returns correct version when unrelated line exists', async () => {
    const version = parseGoModVersion('something\ngo 1.16.1\nsomething');
    expect(version).toEqual('1.16.1');
  });
  it('returns correct version when space exists', async () => {
    const version = parseGoModVersion('  \tgo\t 1.16.1 \t');
    expect(version).toEqual('1.16.1');
  });
  it('returns correct version when comment exists', async () => {
    const version = parseGoModVersion(
      '// some comment\ngo 1.16.1//some other comment'
    );
    expect(version).toEqual('1.16.1');
  });
  it('returns correct version when comment exists with spaces between', async () => {
    const version = parseGoModVersion('go 1.16.1\t  // some comment');
    expect(version).toEqual('1.16.1');
  });
  it('returns correct version when similar version structure exists in comment', async () => {
    const version = parseGoModVersion('// go 1.17.1\ngo 1.16.1 // go 1.15.1');
    expect(version).toEqual('1.16.1');
  });
});
