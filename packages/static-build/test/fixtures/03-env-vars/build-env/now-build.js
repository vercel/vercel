const assert = require('assert');
const fs = require('fs');

assert(process.env.RANDOMNESS_BUILD_ENV_VAR);
assert(!process.env.RANDOMNESS_ENV_VAR);

fs.writeFileSync(
  'dist/index.html',
  `${process.env.RANDOMNESS_BUILD_ENV_VAR}:build-env`,
);
