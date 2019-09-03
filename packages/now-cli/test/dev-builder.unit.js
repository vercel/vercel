import test from 'ava';
import { filterPackage } from '../src/util/dev/builder-cache';

test('[dev-builder] filter install "latest", cached canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': '0.0.1-canary.0'
    }
  };
  const result = filterPackage('@now/build-utils', 'canary', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install "canary", cached stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': '0.0.1'
    }
  };
  const result = filterPackage(
    '@now/build-utils@canary',
    'latest',
    buildersPkg
  );
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': '0.0.1'
    }
  };
  const result = filterPackage('@now/build-utils', 'latest', buildersPkg);
  t.is(result, false);
});

test('[dev-builder] filter install "canary", cached canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': '0.0.1-canary.0'
    }
  };
  const result = filterPackage(
    '@now/build-utils@canary',
    'canary',
    buildersPkg
  );
  t.is(result, false);
});

test('[dev-builder] filter install URL, cached stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': '0.0.1'
    }
  };
  const result = filterPackage('https://tarball.now.sh', 'latest', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install URL, cached canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': '0.0.1-canary.0'
    }
  };
  const result = filterPackage('https://tarball.now.sh', 'canary', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached URL - stable', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': 'https://tarball.now.sh'
    }
  };
  const result = filterPackage('@now/build-utils', 'latest', buildersPkg);
  t.is(result, true);
});

test('[dev-builder] filter install "latest", cached URL - canary', async t => {
  const buildersPkg = {
    dependencies: {
      '@now/build-utils': 'https://tarball.now.sh'
    }
  };
  const result = filterPackage('@now/build-utils', 'canary', buildersPkg);
  t.is(result, true);
});
