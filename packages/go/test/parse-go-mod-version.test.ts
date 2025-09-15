import { parseGoModVersion } from '../src/go-helpers';

describe('parseGoModVersion', function () {
  it('returns undefined with empty string', async () => {
    const version = parseGoModVersion('');
    expect(version).toBeUndefined();
  });
  it('returns exactly same version if patch exists', async () => {
    const version = parseGoModVersion('go 1.21.1');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns the latest patch version if patch is not defined', async () => {
    const version = parseGoModVersion('go 1.16');
    expect(version.go).toEqual('1.16.15');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns correct version when unrelated line exists', async () => {
    const version = parseGoModVersion('something\ngo 1.21.1\nsomething');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns correct version when space exists', async () => {
    const version = parseGoModVersion('  \tgo\t 1.21.1 \t');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns correct version when comment exists', async () => {
    const version = parseGoModVersion(
      '// some comment\ngo 1.21.1//some other comment'
    );
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns correct version when comment exists with spaces between', async () => {
    const version = parseGoModVersion('go 1.21.1\t  // some comment');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns correct version when similar version structure exists in comment', async () => {
    const version = parseGoModVersion('// go 1.17.1\ngo 1.21.1 // go 1.15.1');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns toolchain version if exists', async () => {
    const version = parseGoModVersion('go 1.21.1\ntoolchain go1.22.1');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toEqual('1.22.1');
  });
  it('returns toolchain version when go minor version is lower than 21', async () => {
    const version = parseGoModVersion('go 1.16\ntoolchain go1.22.1');
    expect(version.go).toEqual('1.16.15');
    expect(version.toolchain).toEqual('1.22.1');
  });
  it('returns toolchain version with prerelease if exists', async () => {
    const version = parseGoModVersion('go 1.21.1\ntoolchain go1.22rc1');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toEqual('1.22rc1');
  });
  it('returns go version if toolchain is random value', async () => {
    // should we ignore or throw error?
    const version = parseGoModVersion('go 1.21.1\ntoolchain random1.22.1');
    expect(version.go).toEqual('1.21.1');
    expect(version.toolchain).toBeUndefined();
  });
  it('returns undefined if only contains toolchain', async () => {
    // should we ignore or throw error?
    const version = parseGoModVersion('toolchain go1.22.1');
    expect(version).toBeUndefined();
  });
  it('uses 0 patch version if provided', () => {
    const version = parseGoModVersion('go 1.24.0');
    expect(version?.go).toEqual('1.24.0');
  });
});
