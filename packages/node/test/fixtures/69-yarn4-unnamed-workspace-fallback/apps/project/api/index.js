const ms = require('ms');

module.exports = (req, res) => {
  res.end(`fallback:${ms('1m')}:RANDOMNESS_PLACEHOLDER`);
};
