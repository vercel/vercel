import test from 'ava';
import npa from 'npm-package-arg';
import { filterPackage, isBundledBuilder } from '../src/util/dev/builder-cache';

test('[dev-builder] filter install "latest", cached canary', t => {
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
  t.is(result, true);
});

test('[dev-builder] filter install "canary", cached stable', t => {
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
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached stable', t => {
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
  t.is(result, false);
});

test('[dev-builder] filter install "canary", cached canary', t => {
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
  t.is(result, false);
});

test('[dev-builder] filter install URL, cached stable', t => {
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
  t.is(result, true);
});

test('[dev-builder] filter install URL, cached canary', t => {
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
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached URL - stable', t => {
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
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached URL - canary', t => {
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
  t.is(result, true);
});

test('[dev-builder] filter install not bundled version, cached same version', t => {
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
  t.is(result, false);
});

test('[dev-builder] filter install not bundled version, cached different version', t => {
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
  t.is(result, true);
});

test('[dev-builder] filter install not bundled stable, cached version', t => {
  const buildersPkg = {
    dependencies: {
      'not-bundled-package': '0.0.1',
    },
  };
  const result = filterPackage('not-bundled-package', '_', buildersPkg, {});
  t.is(result, true);
});

test('[dev-builder] filter install not bundled tagged, cached tagged', t => {
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
  t.is(result, true);
});

test('[dev-builder] isBundledBuilder() - stable', t => {
  const nowCliPkg = {
    dependencies: {
      '@now/node': '1.5.2',
    },
  };

  // "canary" tag
  {
    const parsed = npa('@now/node@canary');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, false);
  }

  // "latest" tag
  {
    const parsed = npa('@now/node');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, true);
  }

  // specific matching version
  {
    const parsed = npa('@now/node@1.5.2');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, true);
  }

  // specific non-matching version
  {
    const parsed = npa('@now/node@1.5.1');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, false);
  }

  // URL
  {
    const parsed = npa('https://example.com');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, false);
  }
});

test('[dev-builder] isBundledBuilder() - canary', t => {
  const nowCliPkg = {
    dependencies: {
      '@now/node': '1.5.2-canary.3',
    },
  };

  // "canary" tag
  {
    const parsed = npa('@now/node@canary');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, true);
  }

  // "latest" tag
  {
    const parsed = npa('@now/node');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, false);
  }

  // specific matching version
  {
    const parsed = npa('@now/node@1.5.2-canary.3');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, true);
  }

  // specific non-matching version
  {
    const parsed = npa('@now/node@1.5.2-canary.2');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, false);
  }

  // URL
  {
    const parsed = npa('https://example.com');
    const result = isBundledBuilder(parsed, nowCliPkg);
    t.is(result, false);
  }
});
