import npa from 'npm-package-arg';
import {
  filterPackage,
  getBuildUtils,
  isBundledBuilder,
} from '../../../src/util/dev/builder-cache';

describe('filterPackage', () => {
  it('should filter install "latest", cached canary', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': '0.0.1-canary.0',
      },
    };
    const result = filterPackage(
      '@vercel/build-utils',
      'canary',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });

  it('should filter install "canary", cached stable', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': '0.0.1',
      },
    };
    const result = filterPackage(
      '@vercel/build-utils@canary',
      'latest',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });

  it('should filter install "latest", cached stable', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': '0.0.1',
      },
    };
    const result = filterPackage(
      '@vercel/build-utils',
      'latest',
      buildersPkg,
      {}
    );
    expect(result).toEqual(false);
  });

  it('should filter install "canary", cached canary', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': '0.0.1-canary.0',
      },
    };
    const result = filterPackage(
      '@vercel/build-utils@canary',
      'canary',
      buildersPkg,
      {}
    );
    expect(result).toEqual(false);
  });

  it('should filter install URL, cached stable', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': '0.0.1',
      },
    };
    const result = filterPackage(
      'https://tarball.now.sh',
      'latest',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });

  it('should filter install URL, cached canary', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': '0.0.1-canary.0',
      },
    };
    const result = filterPackage(
      'https://tarball.now.sh',
      'canary',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });

  it('should filter install "latest", cached URL - stable', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': 'https://tarball.now.sh',
      },
    };
    const result = filterPackage(
      '@vercel/build-utils',
      'latest',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });

  it('should filter install "latest", cached URL - canary', () => {
    const buildersPkg = {
      dependencies: {
        '@vercel/build-utils': 'https://tarball.now.sh',
      },
    };
    const result = filterPackage(
      '@vercel/build-utils',
      'canary',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });

  it('should filter install not bundled version, cached same version', () => {
    const buildersPkg = {
      dependencies: {
        'not-bundled-package': '0.0.1',
      },
    };
    const result = filterPackage(
      'not-bundled-package@0.0.1',
      '_',
      buildersPkg,
      {}
    );
    expect(result).toEqual(false);
  });

  it('should filter install not bundled version, cached different version', () => {
    const buildersPkg = {
      dependencies: {
        'not-bundled-package': '0.0.9',
      },
    };
    const result = filterPackage(
      'not-bundled-package@0.0.1',
      '_',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });

  it('should filter install not bundled stable, cached version', () => {
    const buildersPkg = {
      dependencies: {
        'not-bundled-package': '0.0.1',
      },
    };
    const result = filterPackage('not-bundled-package', '_', buildersPkg, {});
    expect(result).toEqual(true);
  });

  it('should filter install not bundled tagged, cached tagged', () => {
    const buildersPkg = {
      dependencies: {
        'not-bundled-package': '16.9.0-alpha.0',
      },
    };
    const result = filterPackage(
      'not-bundled-package@alpha',
      '_',
      buildersPkg,
      {}
    );
    expect(result).toEqual(true);
  });
});

describe('getBuildUtils', () => {
  const tests: [string[], string][] = [
    [['@vercel/static', '@vercel/node@canary'], 'canary'],
    [['@vercel/static', '@vercel/node@0.7.4-canary.0'], 'canary'],
    [['@vercel/static', '@vercel/node@0.8.0'], 'latest'],
    [['@vercel/static', '@vercel/node'], 'latest'],
    [['@vercel/static'], 'latest'],
    [['@vercel/md@canary'], 'canary'],
    [['custom-builder'], 'latest'],
    [['custom-builder@canary'], 'canary'],
    [['canary-bird'], 'latest'],
    [['canary-bird@4.0.0'], 'latest'],
    [['canary-bird@canary'], 'canary'],
    [['@canary/bird'], 'latest'],
    [['@canary/bird@0.1.0'], 'latest'],
    [['@canary/bird@canary'], 'canary'],
    [['https://example.com'], 'latest'],
    [[''], 'latest'],
  ];

  for (const [input, expected] of tests) {
    it(`should install "${expected}" with input ${JSON.stringify(
      input
    )}`, () => {
      const result = getBuildUtils(input);
      expect(result).toEqual(`@vercel/build-utils@${expected}`);
    });
  }
});

describe('isBundledBuilder', () => {
  it('should work with "stable" releases', () => {
    const cliPkg = {
      dependencies: {
        '@vercel/node': '1.6.1',
      },
    };

    // "canary" tag
    {
      const parsed = npa('@vercel/node@canary');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(false);
    }

    // "latest" tag
    {
      const parsed = npa('@vercel/node');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(true);
    }

    // specific matching version
    {
      const parsed = npa('@vercel/node@1.6.1');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(true);
    }

    // specific non-matching version
    {
      const parsed = npa('@vercel/node@1.6.0');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(false);
    }

    // URL
    {
      const parsed = npa('https://example.com');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(false);
    }
  });

  it('should work with "canary" releases', () => {
    const cliPkg = {
      dependencies: {
        '@vercel/node': '1.6.1-canary.0',
      },
    };

    // "canary" tag
    {
      const parsed = npa('@vercel/node@canary');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(true);
    }

    // "latest" tag
    {
      const parsed = npa('@vercel/node');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(false);
    }

    // specific matching version
    {
      const parsed = npa('@vercel/node@1.6.1-canary.0');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(true);
    }

    // specific non-matching version
    {
      const parsed = npa('@vercel/node@1.5.2-canary.9');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(false);
    }

    // URL
    {
      const parsed = npa('https://example.com');
      const result = isBundledBuilder(parsed, cliPkg);
      expect(result).toEqual(false);
    }
  });
});
