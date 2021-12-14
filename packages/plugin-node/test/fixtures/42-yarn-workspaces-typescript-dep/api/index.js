const { say } = require('@builders-typescript-test/lib');

module.exports = (req, res) => {
  res.end(say('api:RANDOMNESS_PLACEHOLDER'));
};
