const cowsay = require('cowsay').say;

module.exports = (req, resp) => {
  resp.end(cowsay({ text: 'cross-cow:RANDOMNESS_PLACEHOLDER' }));
};
