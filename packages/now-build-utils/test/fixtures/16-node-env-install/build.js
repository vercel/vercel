function checkPkgOrThrow(pkgname) {
  try {
    const dep = require(pkgname);
    if (!dep) {
      throw new Error('Undefined');
    }
  } catch (e) {
    console.error(`Expected package "${pkgname}" to be installed.`);
    process.exit(1);
  }
}

// We expect both `dependencies` and `devDependencies` to be installed
// even when NODE_ENV=production.
checkPkgOrThrow('tls-check');
checkPkgOrThrow('exeggcute');

// This is to satisfy `@now/static-build` which needs a `dist` directory.
const { exec } = require('exeggcute');
exec('mkdir dist', __dirname);
exec('echo "node-env:RANDOMNESS_PLACEHOLDER" > dist/index.html', __dirname);
