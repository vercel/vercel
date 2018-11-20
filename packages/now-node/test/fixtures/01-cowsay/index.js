const cowsay = require('cowsay/build/cowsay.umd.js').say;

// test that process.env is not replaced by webpack
process.env.NODE_ENV = 'development';

module.exports = (req, resp) => {
  resp.end(cowsay({ text: 'cow:RANDOMNESS_PLACEHOLDER' }));
};
