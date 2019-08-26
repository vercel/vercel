const assert = require('assert');

module.exports = (req, resp) => {
  assert(!process.env.RANDOMNESS_BUILD_ENV_VAR);
  assert(process.env.RANDOMNESS_ENV_VAR);
  resp.end('BUILD_TIME_PLACEHOLDER:build-env');
};
