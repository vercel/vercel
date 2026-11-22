const ms = require('ms');

module.exports = (req, res) => {
  res.end(`scoped:${ms('1m')}:RANDOMNESS_PLACEHOLDER`);
};
