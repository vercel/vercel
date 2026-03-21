import {
  parseDotnetVersion,
  parseGlobalJsonSdkVersion,
  parseTargetFrameworkChannels,
} from '../src/sdk';

describe('parseGlobalJsonSdkVersion', () => {
  it('returns the configured sdk version', () => {
    expect(
      parseGlobalJsonSdkVersion(
        JSON.stringify({
          sdk: {
            version: '10.0.201',
          },
        })
      )
    ).toBe('10.0.201');
  });

  it('returns undefined when sdk.version is missing', () => {
    expect(parseGlobalJsonSdkVersion('{}')).toBeUndefined();
  });
});

describe('parseTargetFrameworkChannels', () => {
  it('parses a single target framework', () => {
    expect(
      parseTargetFrameworkChannels(
        '<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>'
      )
    ).toEqual(['9.0']);
  });

  it('parses and sorts multiple target frameworks', () => {
    expect(
      parseTargetFrameworkChannels(
        '<Project><PropertyGroup><TargetFrameworks>net8.0; net10.0; net9.0</TargetFrameworks></PropertyGroup></Project>'
      )
    ).toEqual(['10.0', '9.0', '8.0']);
  });

  it('ignores non-net target frameworks', () => {
    expect(
      parseTargetFrameworkChannels(
        '<Project><PropertyGroup><TargetFrameworks>netstandard2.1;net9.0</TargetFrameworks></PropertyGroup></Project>'
      )
    ).toEqual(['9.0']);
  });
});

describe('parseDotnetVersion', () => {
  it('parses stable sdk versions', () => {
    expect(parseDotnetVersion('10.0.201')).toEqual({
      version: '10.0.201',
      major: 10,
      minor: 0,
      patch: 201,
    });
  });

  it('parses prerelease sdk versions', () => {
    expect(parseDotnetVersion('11.0.100-preview.2.26159.112')).toEqual({
      version: '11.0.100',
      major: 11,
      minor: 0,
      patch: 100,
    });
  });
});
