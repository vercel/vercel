const { camelCase } = require('camel-case');

module.exports = (req, res) => {
  res.end(camelCase('camel-case module is working'));
};
