const scheduler = require('@google-cloud/scheduler');

module.exports = (_, res) => {
  if (scheduler) {
    res.end('found:RANDOMNESS_PLACEHOLDER');
  } else {
    res.end('nope:RANDOMNESS_PLACEHOLDER');
  }
};
