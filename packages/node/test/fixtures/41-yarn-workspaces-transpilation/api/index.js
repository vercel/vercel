const { say } = require('@builders-transpiled-test/lib');

module.exports = (req, res) => {
  res.end(say('api:RANDOMNESS_PLACEHOLDER'));
};
