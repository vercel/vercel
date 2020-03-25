function found(pkgname) {
  try {
    require(pkgname);
    return true;
  } catch (e) {
    return false;
  }
}

const production = found('copee');
const development = found('tls-check');

if (!production) {
  throw new Error('Expected production dependencies to be installed.');
}

if (development) {
  throw new Error('Expected development dependencies to _NOT_ be installed.');
}

// This is to satisfy `@now/static-build` which needs a `dist` directory.
const { execSync } = require('child_process');
execSync('mkdir dist');
execSync('echo "npm-prod:RANDOMNESS_PLACEHOLDER" > dist/index.html');
