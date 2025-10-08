const { say } = require('@builders-test/lib');

module.exports = (req, res) => {
  res.end(say('api:RANDOMNESS_PLACEHOLDER'));
};
