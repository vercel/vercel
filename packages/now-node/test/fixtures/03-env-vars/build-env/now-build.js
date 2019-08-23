const assert = require('assert');
const fs = require('fs');

assert(process.env.RANDOMNESS_BUILD_ENV_VAR);
assert(!process.env.RANDOMNESS_ENV_VAR);

fs.writeFileSync(
  'index.js',
  fs
    .readFileSync('index.js', 'utf8')
    .replace('BUILD_TIME_PLACEHOLDER', process.env.RANDOMNESS_BUILD_ENV_VAR),
);
