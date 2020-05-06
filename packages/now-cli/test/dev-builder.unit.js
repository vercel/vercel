import test from 'ava';
import { filterPackage } from '../src/util/dev/builder-cache';

test('[dev-builder] filter install "latest", cached canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': '0.0.1-canary.0',
    },
  };
  const result = filterPackage('@vercel/build-utils', 'canary', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install "canary", cached stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': '0.0.1',
    },
  };
  const result = filterPackage(
    '@vercel/build-utils@canary',
    'latest',
    buildersPkg
  );
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': '0.0.1',
    },
  };
  const result = filterPackage('@vercel/build-utils', 'latest', buildersPkg);
  t.is(result, false);
});

test('[dev-builder] filter install "canary", cached canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': '0.0.1-canary.0',
    },
  };
  const result = filterPackage(
    '@vercel/build-utils@canary',
    'canary',
    buildersPkg
  );
  t.is(result, false);
});

test('[dev-builder] filter install URL, cached stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': '0.0.1',
    },
  };
  const result = filterPackage('https://tarball.now.sh', 'latest', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install URL, cached canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': '0.0.1-canary.0',
    },
  };
  const result = filterPackage('https://tarball.now.sh', 'canary', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached URL - stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': 'https://tarball.now.sh',
    },
  };
  const result = filterPackage('@vercel/build-utils', 'latest', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached URL - canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@vercel/build-utils': 'https://tarball.now.sh',
    },
  };
  const result = filterPackage('@vercel/build-utils', 'canary', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install not bundled version, cached same version', async t => {
  const buildersPkg = {
    dependencies: {
      'not-bundled-package': '0.0.1',
    },
  };
  const result = filterPackage('not-bundled-package@0.0.1', '_', buildersPkg);
  t.is(result, false);
});

test('[dev-builder] filter install not bundled version, cached different version', async t => {
  const buildersPkg = {
    dependencies: {
      'not-bundled-package': '0.0.9',
    },
  };
  const result = filterPackage('not-bundled-package@0.0.1', '_', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install not bundled stable, cached version', async t => {
  const buildersPkg = {
    dependencies: {
      'not-bundled-package': '0.0.1',
    },
  };
  const result = filterPackage('not-bundled-package', '_', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install not bundled tagged, cached tagged', async t => {
  const buildersPkg = {
    dependencies: {
      'not-bundled-package': '16.9.0-alpha.0',
    },
  };
  const result = filterPackage('not-bundled-package@alpha', '_', buildersPkg);
  t.is(result, true);
});
