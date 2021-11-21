const text2Svg = require('text-svg');

module.exports = (req, res) => {
  res.end(text2Svg('My name is Chika-chika Slim Shady', { color: 'blue' }));
};
